import { View, Text } from "react-native";

export default function HomeScreen() {
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>NCoto</Text>
      <Text style={{ marginTop: 8 }}>Inicio (placeholder)</Text>
    </View>
  );
}
