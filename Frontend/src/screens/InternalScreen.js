import React, { useState } from 'react';
import { View, Text, TextInput } from 'react-native';

export default function InternalScreen() {
  const [text1, setText1] = useState('');
  const [text2, setText2] = useState('');

  return (
    <View>
      <Text>Internal Screen</Text>

      <TextInput
        placeholder="First Text Box"
        value={text1}
        onChangeText={setText1}
      />

      <TextInput
        placeholder="Second Text Box"
        value={text2}
        onChangeText={setText2}
      />
    </View>
  );
}
