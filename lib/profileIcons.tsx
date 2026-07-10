import type { ComponentProps } from 'react';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export const PROFILE_ICON_OPTIONS = [
  { value: 'bear', label: 'Bär', icon: 'teddy-bear' },
  { value: 'fox', label: 'Fuchs', icon: 'firefox' },
  { value: 'crow', label: 'Rabe', icon: 'owl' },
  { value: 'rabbit', label: 'Hase', icon: 'rabbit' },
  { value: 'cat', label: 'Katze', icon: 'cat' },
  { value: 'panda', label: 'Panda', icon: 'panda' },
] as const;

export type ProfileIconValue = (typeof PROFILE_ICON_OPTIONS)[number]['value'];

export type ProfileIconProps = {
  icon: ProfileIconValue;
  color: string;
  size?: number;
};

export function getProfileIconName(icon: ProfileIconValue) {
  const option = PROFILE_ICON_OPTIONS.find((item) => item.value === icon);
  return option?.icon ?? 'account-circle-outline';
}

export function ProfileIcon({ icon, color, size = 24 }: ProfileIconProps) {
  const name = getProfileIconName(icon) as ComponentProps<typeof MaterialCommunityIcons>['name'];
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}
