import { Input } from "./ui/input";
import { Label } from "./ui/label";

type AuthFieldProps = {
  name: string;
  label: string;
  type?: string;
  autoComplete?: string;
  value: string;
  errors: ({ message: string } | undefined)[];
  onChange: (value: string) => void;
  onBlur: () => void;
};

export default function AuthField({ name, label, errors, onChange, ...input }: AuthFieldProps) {
  const messages = errors.flatMap((error) => (error ? [error.message] : []));
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        aria-invalid={messages.length > 0}
        aria-describedby={messages.length > 0 ? `${name}-error` : undefined}
        onChange={(e) => onChange(e.target.value)}
        {...input}
      />
      {messages.length > 0 && (
        <p id={`${name}-error`} className="text-sm font-medium text-destructive">
          {messages.join(" ")}
        </p>
      )}
    </div>
  );
}
