import type { ButtonProps } from "./Button";
import { Button } from "./Button";

type Props = Pick<ButtonProps, "title" | "onPress" | "disabled" | "loading" | "minHeight">;

/** @deprecated Prefer `Button` con `variant` explícito; se mantiene por compatibilidad. */
export function AppButton({ title, onPress, disabled, loading, minHeight }: Props) {
  return (
    <Button title={title} onPress={onPress} variant="primary" disabled={disabled} loading={loading} minHeight={minHeight} />
  );
}
