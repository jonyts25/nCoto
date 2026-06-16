import { View, Text } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function HomeScreen() {
  return (
    <SafeAreaView style={{ flex: 1 }} edges={["top", "left", "right", "bottom"]}>
      <View style={{ flex: 1, padding: 24, justifyContent: "center" }}>
        <Text style={{ fontSize: 22, fontWeight: "700" }}>NCoto</Text>
        <Text style={{ marginTop: 8 }}>Inicio (placeholder)</Text>
      </View>
    </SafeAreaView>
  );
}
