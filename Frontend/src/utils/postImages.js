import * as ImagePicker from 'expo-image-picker';

export async function pickPostImage(currentImages, limit) {
  if (currentImages.length >= limit) return null;
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [4, 3],
    quality: 0.1,
    base64: true,
  });
  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];
  return { uri: asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri };
}
