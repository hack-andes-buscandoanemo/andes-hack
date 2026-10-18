type ConsentFieldProps = {
  name: string;
  label: string;
  checked: boolean;
  errors: ({ message: string } | undefined)[];
  onChange: (checked: boolean) => void;
};

// A consent checkbox that says why the form will not send when it is left unticked.
export default function ConsentField({
  name,
  label,
  checked,
  errors,
  onChange,
}: ConsentFieldProps) {
  const messages = errors.flatMap((error) => (error ? [error.message] : []));
  return (
    <div className="space-y-1">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name={name}
          checked={checked}
          aria-invalid={messages.length > 0}
          aria-describedby={messages.length > 0 ? `${name}-error` : undefined}
          onChange={(e) => onChange(e.target.checked)}
        />
        {label}
      </label>
      {messages.length > 0 && (
        <p id={`${name}-error`} className="text-sm font-medium text-destructive">
          {messages.join(" ")}
        </p>
      )}
    </div>
  );
}
