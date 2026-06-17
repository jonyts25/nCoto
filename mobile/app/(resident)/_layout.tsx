import { Tabs, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useRef } from "react";
import { useAuth } from "@/src/features/auth/useAuth";
import {
  residentIsAwaitingApproval,
  residentNeedsOnboarding,
} from "@/src/features/auth/onboardingRepo";

export default function ResidentLayout() {
  const router = useRouter();
  const { userRole, profile, isLoading } = useAuth();
  const kickRef = useRef<string | null>(null);

  useEffect(() => {
    if (isLoading || !profile || userRole !== "resident") return;
    if (residentNeedsOnboarding(profile)) {
      const k = "res:onboarding";
      if (kickRef.current === k) return;
      kickRef.current = k;
      router.replace("/(auth)/onboarding");
      return;
    }
    if (residentIsAwaitingApproval(profile)) {
      const k = "res:waiting";
      if (kickRef.current === k) return;
      kickRef.current = k;
      router.replace("/(auth)/waiting");
    }
  }, [isLoading, profile, userRole, router]);

  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: "#0077B6" }}>
      <Tabs.Screen
        name="index"
        options={{
          title: "Inicio",
          tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="visits"
        options={{
          title: "Visitas",
          tabBarIcon: ({ color }) => <Ionicons name="person-add" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          href: null,
          title: "Pagos",
          tabBarIcon: ({ color }) => <Ionicons name="receipt-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="treasury"
        options={{
          href: null,
          title: "Tesorería",
          tabBarIcon: ({ color }) => <Ionicons name="stats-chart-outline" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Mi Casa",
          tabBarIcon: ({ color }) => <Ionicons name="home" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          href: null,
          title: "Usuarios",
          tabBarIcon: ({ color }) => <Ionicons name="people-circle" size={24} color={color} />,
        }}
      />
      <Tabs.Screen name="visit/[id]" options={{ href: null }} />
    </Tabs>
  );
}
