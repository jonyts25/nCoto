// app/(admin)/_layout.tsx
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function AdminLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: '#34C759' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Panel',
          tabBarIcon: ({ color }) => <Ionicons name="pie-chart" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="directory"
        options={{
          title: 'Residentes',
          tabBarIcon: ({ color }) => <Ionicons name="people" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="users"
        options={{
          title: 'Usuarios',
          tabBarIcon: ({ color }) => <Ionicons name="person-circle" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="announcements"
        options={{
          href: null,
          title: 'Alertas',
          tabBarIcon: ({ color }) => <Ionicons name="warning" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="pending_payments"
        options={{
          href: null,
          title: 'Pagos',
          tabBarIcon: ({ color }) => <Ionicons name="cash-outline" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}