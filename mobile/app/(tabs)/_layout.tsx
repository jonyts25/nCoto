import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerTitleAlign: "center" }}>
      <Tabs.Screen
        name="index"
        options={{ title: "Inicio" }}
      />
      <Tabs.Screen
        name="visits"
        options={{ title: "Visitas" }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Perfil" }}
      />
      <Tabs.Screen 
        name="scan" 
        options={{ title: "Escanear" }} 
      />
    </Tabs>
  );
}
