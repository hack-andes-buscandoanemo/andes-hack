import { useEffect, useState } from "react";

export default function ProfileAvatar({
  name,
  photoUrl,
  className,
}: {
  name: string;
  photoUrl: string | null;
  className: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase())
    .join("");

  useEffect(() => setImageFailed(false), [photoUrl]);

  return photoUrl && !imageFailed ? (
    <img
      alt={`Foto de ${name}`}
      src={photoUrl}
      className={`${className} shrink-0 rounded-full object-cover`}
      onError={() => setImageFailed(true)}
    />
  ) : (
    <span
      role="img"
      aria-label={`Iniciales de ${name}`}
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-foreground text-[0.8125rem] font-semibold text-background`}
    >
      {initials}
    </span>
  );
}
