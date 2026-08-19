import React, { useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { sanitizeInput } from '../lib/security';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSubmit: (text: string) => void;
  initialText?: string;
};

export default function CommentInput({ visible, onClose, onSubmit, initialText = '' }: Props) {
  const [text, setText] = useState(initialText);

  const handleSubmit = () => {
    const cleanText = sanitizeInput(text);
    onSubmit(cleanText);
    onClose();
    setText('');
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <Text style={styles.title}>Oyunuza bir yorum ekleyin (max 200 karakter)</Text>
          <TextInput
            style={styles.input}
            multiline
            maxLength={200}
            placeholder="Yorum..."
            value={text}
            onChangeText={setText}
          />
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.button} onPress={onClose}>
              <Text style={styles.buttonText}>İptal</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={handleSubmit}>
              <Text style={[styles.buttonText, styles.buttonTextPrimary]}>Gönder</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  container: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '100%',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    textAlign: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 16,
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  button: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#e0e0e0',
  },
  buttonPrimary: {
    backgroundColor: '#4a90e2',
  },
  buttonText: {
    color: '#333',
    fontWeight: '500',
  },
  buttonTextPrimary: {
    color: '#fff',
  },
});
