import { useColorScheme as useColorSchemeCore } from 'react-native';

import { useOptionalAuth } from '@/contexts/AuthProvider';

export function useColorScheme(): 'light' | 'dark' {
	const auth = useOptionalAuth();
	const themePreference = auth?.profile?.theme_preference ?? 'system';
	const coreScheme = useColorSchemeCore();

	if (themePreference === 'light' || themePreference === 'dark') {
		return themePreference;
	}

	return coreScheme === 'dark' ? 'dark' : 'light';
}
