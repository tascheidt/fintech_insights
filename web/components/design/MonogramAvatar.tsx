/**
 * MonogramAvatar — size-variant wrapper over the existing
 * `CompanyAvatar` primitive in `web/components/companies/CompanyAvatar.tsx`.
 *
 * The underlying CompanyAvatar already owns the deterministic 6-color
 * palette and initial logic — we just expose a few named sizes for use
 * across v2 surfaces. Don't fork the palette.
 */

import { CompanyAvatar } from "@/components/companies/CompanyAvatar";

export type MonogramSize = "sm" | "md" | "lg";

const SIZE_PX: Record<MonogramSize, number> = {
  sm: 22,
  md: 28,
  lg: 36,
};

export interface MonogramAvatarProps {
  name: string | undefined;
  size?: MonogramSize | number;
  className?: string;
}

export function MonogramAvatar({
  name,
  size = "md",
  className,
}: MonogramAvatarProps) {
  const px = typeof size === "number" ? size : SIZE_PX[size];
  return <CompanyAvatar name={name} size={px} className={className} />;
}
