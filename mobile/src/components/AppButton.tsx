import { Pressable, Text } from "react-native";

type Props = {
  title: string;
  onPress: () => void | Promise<void>;
};

export function AppButton({ title, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        backgroundColor: "black",
        paddingVertical: 12,
        borderRadius: 10,
        alignItems: "center",
      }}
    >
      <Text style={{ color: "white", fontWeight: "600" }}>{title}</Text>
    </Pressable>
  );
}
