type TrapFieldProps = {
  id: string;
  value: string;
  onChange: (value: string) => void;
};

// A field for bots only: off screen, out of the tab order and hidden from screen readers.
// The server thanks whoever fills it and stores nothing.
export default function TrapField({ id, value, onChange }: TrapFieldProps) {
  return (
    <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
      <label htmlFor={id}>Sitio web</label>
      <input
        id={id}
        name="website"
        tabIndex={-1}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
