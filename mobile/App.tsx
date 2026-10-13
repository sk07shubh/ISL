import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { SettingsProvider } from "./src/state";
import { InterpreterScreen } from "./src/screens/InterpreterScreen";
import { LiveTestScreen } from "./src/screens/LiveTestScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { C } from "./src/theme";

const Tabs = createBottomTabNavigator();
const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.bg, primary: C.primary, card: C.surface, border: C.line } };

export default function App() {
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <NavigationContainer theme={theme}>
          <StatusBar style="dark" />
          <Tabs.Navigator screenOptions={{
            headerShown: false, tabBarActiveTintColor: C.primary, tabBarInactiveTintColor: C.text3,
            tabBarStyle: { borderTopColor: C.line, backgroundColor: C.surface },
          }}>
            <Tabs.Screen name="Interpreter" component={InterpreterScreen} options={{ tabBarIcon: () => null, tabBarLabel: "Interpreter" }} />
            <Tabs.Screen name="Live test" component={LiveTestScreen} />
            <Tabs.Screen name="History" component={HistoryScreen} />
          </Tabs.Navigator>
        </NavigationContainer>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
