import { View, Text, FlatList, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useVisitRepo } from "../../src/features/visits/repo";
import { Ionicons } from "@expo/vector-icons";
import { ScreenHeader } from "@/src/components/ScreenHeader";

export default function SecurityLogs() {
  const { visits } = useVisitRepo();

  const history = visits.filter((v) => v.status === "used" || v.status === "active");

  return (
    <SafeAreaView style={styles.container} edges={["top", "left", "right", "bottom"]}>
      <ScreenHeader title="Bitácora de accesos" showBack={false} />
      <FlatList
        style={{ flex: 1 }}
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.logCard}>
            <View style={styles.iconContainer}>
              <Ionicons 
                name={item.status === 'used' ? "checkmark-circle" : "time-outline"} 
                size={24} 
                color={item.status === 'used' ? "#34C759" : "#FF9500"} 
              />
            </View>
            <View style={styles.info}>
              <Text style={styles.visitorName}>{item.guestName}</Text>
              <Text style={styles.statusText}>
                {(item.visitType ?? 'eventual') === 'frecuente' && item.status === 'active'
                  ? 'Frecuente — último acceso según horario'
                  : item.status === 'used'
                    ? 'Entrada registrada'
                    : 'Pendiente de llegada'}{' '}
                · {item.visitType ?? 'eventual'}
              </Text>
            </View>
            <Text style={styles.time}>
              {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#fff' },
  logCard: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingVertical: 15, 
    borderBottomWidth: 1, 
    borderBottomColor: '#eee' 
  },
  iconContainer: { marginRight: 15 },
  info: { flex: 1 },
  visitorName: { fontSize: 16, fontWeight: '600' },
  statusText: { fontSize: 12, color: '#666' },
  time: { fontSize: 12, color: '#999' }
});