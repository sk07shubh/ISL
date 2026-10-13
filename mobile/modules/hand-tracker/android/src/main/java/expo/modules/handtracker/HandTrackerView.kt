package expo.modules.handtracker

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.util.Size
import android.view.ViewGroup
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * Camera preview + hand tracking on the phone.
 * Every camera frame is analysed by MediaPipe HandLandmarker (the same model as the website and live_clean.py).
 * Each result is sent to JavaScript as: hands -> 21 points -> [x, y, z], plus the frame's width and height.
 * The frame is not mirrored, matching the training images.
 */
class HandTrackerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onHands by EventDispatcher()

  private val previewView = PreviewView(context).apply {
    layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
  }
  private val analysisExecutor: ExecutorService = Executors.newSingleThreadExecutor()
  private val mainHandler = Handler(Looper.getMainLooper())
  private var landmarker: HandLandmarker? = null
  private var cameraProvider: ProcessCameraProvider? = null
  private var analysis: ImageAnalysis? = null
  @Volatile private var active = true

  init {
    addView(previewView)
    landmarker = createLandmarker(context)
    startCamera()
  }

  fun setActive(value: Boolean) { active = value }

  private fun createLandmarker(context: Context): HandLandmarker {
    val base = BaseOptions.builder().setModelAssetPath("hand_landmarker.task").build()
    val options = HandLandmarker.HandLandmarkerOptions.builder()
      .setBaseOptions(base)
      .setRunningMode(RunningMode.VIDEO)
      .setNumHands(2)
      .setMinHandDetectionConfidence(0.35f)
      .setMinHandPresenceConfidence(0.35f)
      .setMinTrackingConfidence(0.35f)
      .build()
    return HandLandmarker.createFromOptions(context, options)
  }

  private fun startCamera() {
    val owner = appContext.currentActivity as? LifecycleOwner ?: return
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      val provider = future.get()
      cameraProvider = provider
      val preview = Preview.Builder().build().also { it.setSurfaceProvider(previewView.surfaceProvider) }
      val analyzer = ImageAnalysis.Builder()
        .setTargetResolution(Size(640, 480))
        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
        .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
        .build()
      analyzer.setAnalyzer(analysisExecutor) { image -> analyse(image) }
      analysis = analyzer
      provider.unbindAll()
      provider.bindToLifecycle(owner, CameraSelector.DEFAULT_FRONT_CAMERA, preview, analyzer)
    }, ContextCompat.getMainExecutor(context))
  }

  private fun analyse(image: androidx.camera.core.ImageProxy) {
    try {
      if (!active) return
      val lm = landmarker ?: return
      val bitmap = image.toBitmap()
      val rotation = image.imageInfo.rotationDegrees
      val mpImage = BitmapImageBuilder(bitmap).build()
      val options = ImageProcessingOptions.builder().setRotationDegrees(rotation).build()
      val result = lm.detectForVideo(mpImage, options, SystemClock.uptimeMillis())

      // Dimensions of the frame as MediaPipe sees it (after the rotation it is given).
      val upright = rotation % 180 == 0
      val width = if (upright) bitmap.width else bitmap.height
      val height = if (upright) bitmap.height else bitmap.width

      val hands = result.landmarks().map { hand ->
        hand.map { p -> listOf(p.x().toDouble(), p.y().toDouble(), p.z().toDouble()) }
      }
      val payload = mapOf(
        "hands" to hands,
        "width" to width.toDouble(),
        "height" to height.toDouble(),
        "timestamp" to SystemClock.uptimeMillis().toDouble(),
      )
      mainHandler.post { onHands(payload) }
    } catch (e: Exception) {
      // A single bad frame must not stop the camera; the next frame is processed normally.
    } finally {
      image.close()
    }
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    cameraProvider?.unbindAll()
    analysis?.clearAnalyzer()
    analysisExecutor.shutdown()
    landmarker?.close()
    landmarker = null
  }
}
