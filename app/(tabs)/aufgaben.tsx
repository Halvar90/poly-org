import { StyleSheet, Text, View } from 'react-native';

export default function AufgabenScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Aufgaben</Text>
      <Text style={styles.subtitle}>
        Hier verwaltet ihr bald eure gemeinsamen To-dos und Erinnerungen.
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
    marginBottom: 8,
    color: '#1a1a2e',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    color: '#555',
  },
});
