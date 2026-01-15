import { useEffect, useMemo, useState } from "react";
import { View, Text, FlatList, Modal, TextInput, Pressable } from "react-native";
import { AppButton } from "@/src/components/AppButton";
import { createVisit, listVisits, clearAllVisits } from "@/src/features/visits/repo";
import type { Visit } from "@/src/features/visits/types";
import { Link } from "expo-router";

type Filter = "active" | "used" | "expired" | "all";
const [filter, setFilter] = useState<Filter>("active");

export default function VisitsScreen() {
  const [visits, setVisits] = useState<Visit[]>([]);
  const [open, setOpen] = useState(false);

  // form
  const [guestName, setGuestName] = useState("");
  const [plates, setPlates] = useState("");
  const [note, setNote] = useState("");
    type Validity = "2h" | "24h" | "7d" | "today";
  const [validity, setValidity] = useState<Validity>("24h");

  const validUntilISO = useMemo(() => {
  const now = new Date();
    if (validity === "2h") {
      return new Date(now.getTime() + 2 * 60 * 60 * 1000).toISOString();
    }
    if (validity === "24h") {
      return new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    }
    if (validity === "7d") {
      return new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    }
    // today: hasta hoy 23:59:59
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    return end.toISOString();
  }, [validity, open]);

  async function refresh() {
    const v = await listVisits();
    setVisits(v);
  }

  useEffect(() => {
    refresh();
  }, []);

  async function onCreate() {
    if (!guestName.trim()) return;
    await createVisit({ guestName, plates, note, validUntil: validUntilISO });
    setGuestName("");
    setPlates("");
    setNote("");
    setOpen(false);
    await refresh();
  }

  async function onReset() {
    await clearAllVisits();
    await refresh();
  }
  const filteredVisits = useMemo(() => {
  if (filter === "all") return visits;
  return visits.filter(v => v.status === filter);
  }, [visits, filter]);


  return (
    <View style={{ flex: 1, padding: 16, gap: 12 }}>
      <Text style={{ fontSize: 20, fontWeight: "700" }}>Visitas</Text>
      
      <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
      {([
        ["active", "Activas"],
        ["used", "Usadas"],
        ["expired", "Expiradas"],
        ["all", "Todas"],
      ] as const).map(([key, label]) => (
        <Pressable
          key={key}
          onPress={() => setFilter(key)}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: filter === key ? "black" : "#ddd",
            backgroundColor: filter === key ? "black" : "white",
          }}
        >
          <Text style={{ color: filter === key ? "white" : "black", fontWeight: "600" }}>
            {label}
          </Text>
        </Pressable>
      ))}
    </View>


      <AppButton title="Nueva visita" onPress={() => setOpen(true)} />

      <Pressable onPress={onReset} style={{ paddingVertical: 6 }}>
        <Text style={{ color: "#666" }}>Borrar todo (debug)</Text>
      </Pressable>

      <FlatList
        data={filteredVisits}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<Text style={{ color: "#666" }}>Sin visitas aún.</Text>}
        renderItem={({ item }) => (
  <Link href={{ pathname: "/visit/[id]", params: { id: item.id } }} asChild>
    <Pressable>
      <View
        style={{
          borderWidth: 1,
          borderColor: "#ddd",
          borderRadius: 12,
          padding: 12,
          marginBottom: 10,
        }}
      >
        <Text style={{ fontWeight: "700" }}>{item.guestName}</Text>
        {!!item.plates && <Text>Placas: {item.plates}</Text>}
        {!!item.note && <Text>Nota: {item.note}</Text>}
        <Text style={{ color: "#666", marginTop: 6 }}>
          Vigencia: {new Date(item.validUntil).toLocaleString()}
        </Text>
        <Text style={{ color: "#666" }}>Estado: {item.status}</Text>
      </View>
    </Pressable>
  </Link>
)}

      />

      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 12 }}>
          <Text style={{ fontSize: 20, fontWeight: "700" }}>Nueva visita</Text>

          <TextInput
            placeholder="Nombre del invitado"
            value={guestName}
            onChangeText={setGuestName}
            style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12 }}
          />

          <TextInput
            placeholder="Placas (opcional)"
            value={plates}
            onChangeText={setPlates}
            style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12 }}
          />

          <TextInput
            placeholder="Nota (opcional)"
            value={note}
            onChangeText={setNote}
            style={{ borderWidth: 1, borderColor: "#ccc", borderRadius: 10, padding: 12 }}
          />
          <Text style={{ marginTop: 8, fontWeight: "700" }}>Vigencia</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {([
              ["2h", "2 horas"],
              ["24h", "24 horas"],
              ["7d", "7 días"],
              ["today", "Hoy"],
            ] as const).map(([key, label]) => (
              <Pressable
                key={key}
                onPress={() => setValidity(key)}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: validity === key ? "black" : "#ddd",
                  backgroundColor: validity === key ? "black" : "white",
                }}
              >
                <Text style={{ color: validity === key ? "white" : "black", fontWeight: "600" }}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={{ color: "#666", marginTop: 6 }}>
            Expira: {new Date(validUntilISO).toLocaleString()}
          </Text>


          <AppButton title="Crear" onPress={onCreate} />

          <Pressable onPress={() => setOpen(false)} style={{ paddingVertical: 10, alignItems: "center" }}>
            <Text style={{ color: "#666" }}>Cancelar</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
