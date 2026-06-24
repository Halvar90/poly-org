import { Image, StyleSheet, Text, View } from 'react-native';

const characters = [
  { name: 'Bär', image: require('@/assets/baer.png') },
  { name: 'Fuchs', image: require('@/assets/fuchs.png') },
  { name: 'Rabe', image: require('@/assets/rabe.png') },
];

export default function KalenderScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Willkommen bei PolyOrg!</Text>
      <Text style={styles.subtitle}>
        Euer gemeinsamer Kalender für Bär, Fuchs und Rabe.
      </Text>

      <View style={styles.charactersRow}>
        {characters.map((character) => (
          <View key={character.name} style={styles.characterCard}>
            <Image source={character.image} style={styles.characterImage} />
            <Text style={styles.characterName}>{character.name}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.hint}>
        Platzhalter-Bilder aktiv – ersetze baer.png, fuchs.png und rabe.png im
        Ordner assets durch eure echten Avatare.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
    color: '#1a1a2e',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#555',
    marginBottom: 32,
  },
  charactersRow: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  characterCard: {
    alignItems: 'center',
  },
  characterImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#eee',
  },
  characterName: {
    marginTop: 8,
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  hint: {
    fontSize: 12,
    textAlign: 'center',
    color: '#888',
    paddingHorizontal: 16,
  },
});
