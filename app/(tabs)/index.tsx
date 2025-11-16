import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

// ================================================================
// SETUP 
// ================================================================

// Import Firebase untuk autentikasi dan database
import auth, { FirebaseAuthTypes } from '@react-native-firebase/auth';
import firestore from '@react-native-firebase/firestore';

// Import dan inisialisasi MMKV
import { createMMKV } from 'react-native-mmkv';
const storage = createMMKV();

// Definisi kunci untuk menyimpan data
const PROFILE_STORAGE_KEY = 'user.profile';
const MAHASISWA_STORAGE_KEY = 'mahasiswa.data';

// ================================================================
// DEFINISI TIPE DATA - Untuk Type Safety TypeScript
// ================================================================

// Struktur data profil pengguna
type UserProfile = {
  uid: string;
  email: string | null;
};

// Struktur data mahasiswa yang diambil dari Firestore
type Mahasiswa = {
  id: string; // ID unik dokumen dari Firestore
  nim: string;
  nama: string;
  jurusan: string;
};

// ================================================================
// KOMPONEN UI
// ================================================================

// Komponen login - hanya menampilkan form tanpa logika kompleks
// Semua data dan fungsi diterima melalui props
interface LoginScreenProps {
  email: string;
  password: string;
  setEmail: (email: string) => void;
  setPassword: (password: string) => void;
  handleLogin: () => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({
  email,
  password,
  setEmail,
  setPassword,
  handleLogin,
}) => {
  return (
    <View style={styles.loginContainer}>
      <Text style={styles.title}>Welcome!</Text>
      <Text style={styles.subtitle}>Login dulu, ya!</Text>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Email</Text>
        <TextInput
          style={styles.input}
          placeholder="contoh@email.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />
      </View>
      <View style={styles.inputGroup}>
        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          placeholder="Masukkan password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />
      </View>
      <Button title="Login" onPress={handleLogin} />
    </View>
  );
};

// Komponen utama setelah login - menampilkan semua data yang diperlukan
// Data dan fungsi diterima dari komponen induk
interface HomeScreenProps {
  user: FirebaseAuthTypes.User;
  mmkvProfile: UserProfile | null;
  mahasiswa: Mahasiswa[];
  loadingMahasiswa: boolean;
  fetchMahasiswa: () => void;
  handleLogout: () => void;
}

const HomeScreen: React.FC<HomeScreenProps> = ({
  user,
  mmkvProfile,
  mahasiswa,
  loadingMahasiswa,
  fetchMahasiswa,
  handleLogout,
}) => {
  // Fungsi untuk merender setiap item mahasiswa dalam list
  const renderMahasiswaItem = ({ item }: { item: Mahasiswa }) => (
    <View style={styles.itemContainer}>
      <Text style={styles.itemTitle}>{item.nama}</Text>
      <Text style={styles.itemDetails}>NIM: {item.nim}</Text>
      <Text style={styles.itemDetails}>Jurusan: {item.jurusan}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Selamat Datang, {user?.email}</Text>

      {/* Data pengguna aktif dari Firebase */}
      <View style={styles.dataBox}>
        <Text style={styles.subTitle}>Sesi Firebase (Live)</Text>
        <Text style={styles.dataText}>Email: {user?.email}</Text>
        <Text style={styles.dataText}>UID: {user?.uid}</Text>
      </View>

      {/* Data profil yang tersimpan di MMKV */}
      <View style={styles.dataBox}>
        <Text style={styles.subTitle}>Profil dari MMKV (Cache)</Text>
        {mmkvProfile ? (
          <>
            <Text style={styles.dataText}>Email: {mmkvProfile.email}</Text>
            <Text style={styles.dataText}>UID: {mmkvProfile.uid}</Text>
          </>
        ) : (
          <Text style={styles.errorText}>Data Profil MMKV tidak ditemukan.</Text>
        )}
      </View>

      {/* Daftar mahasiswa - dari Firestore dengan cache MMKV untuk performa */}
      <View style={styles.dataBox}>
        <View style={styles.mahasiswaHeader}>
          <Text style={styles.subTitle}>Data Mahasiswa</Text>
          <Button title="Refresh" onPress={fetchMahasiswa} disabled={loadingMahasiswa} />
        </View>
        {loadingMahasiswa && !mahasiswa.length ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : (
          <FlatList
            data={mahasiswa}
            renderItem={renderMahasiswaItem}
            keyExtractor={(item) => item.id}
            ListEmptyComponent={<Text style={styles.errorText}>Tidak ada data mahasiswa.</Text>}
            style={{ maxHeight: 150 }} // Membatasi tinggi agar tidak memenuhi layar
          />
        )}
      </View>

      <Button title="Logout" onPress={handleLogout} color="#D9534F" />
    </View>
  );
};

// ================================================================
// KOMPONEN UTAMA
// ================================================================

const App = () => {
  // State untuk mengelola aplikasi
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [mmkvProfile, setMmkvProfile] = useState<UserProfile | null>(null);
  const [mahasiswa, setMahasiswa] = useState<Mahasiswa[]>([]);
  const [loadingMahasiswa, setLoadingMahasiswa] = useState(false);

  // State untuk form login
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  /**
   * Fungsi untuk mengambil data mahasiswa dengan strategi "Cache-First".
   * useCallback digunakan agar React tidak membuat ulang fungsi ini setiap render.
   */
  const fetchMahasiswa = useCallback(async () => {
    setLoadingMahasiswa(true);
    console.log('Mengambil data mahasiswa...');

    // 1. Periksa cache MMKV terlebih dahulu untuk respons yang cepat
    // Jika tersedia, tampilkan segera untuk mengurangi waktu tunggu
    const cachedData = storage.getString(MAHASISWA_STORAGE_KEY);
    if (cachedData) {
      console.log('Data ditemukan di cache, menampilkan data.');
      setMahasiswa(JSON.parse(cachedData));
    }

    // 2. Ambil data terbaru dari server untuk memastikan sinkronisasi
    // Data tetap fresh dan tidak ketinggalan zaman
    try {
      const snapshot = await firestore().collection('mahasiswa').get();
      if (!snapshot.empty) {
        const dataFromFirestore = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as Mahasiswa[];

        console.log('Data berhasil diambil dari Firestore!');
        // Perbarui tampilan dengan data terbaru
        setMahasiswa(dataFromFirestore);

        // 3. Simpan data baru ke cache untuk akses cepat selanjutnya
        // Persiapan agar aplikasi memiliki data siap saat dibuka kembali
        storage.set(MAHASISWA_STORAGE_KEY, JSON.stringify(dataFromFirestore));
      } else {
        console.log('Tidak ada data mahasiswa di Firestore.');
        // Jika server kosong, bersihkan cache lokal untuk konsistensi
        setMahasiswa([]);
        storage.remove(MAHASISWA_STORAGE_KEY);
      }
    } catch (error) {
      console.error("Gagal mengambil data mahasiswa dari Firestore: ", error);
      // Jika gagal dari server, setidaknya data cache sudah ditampilkan
      Alert.alert('Error', 'Gagal mengambil data mahasiswa dari server.');
    } finally {
      setLoadingMahasiswa(false);
    }
  }, []);

  /**
   * useEffect untuk memantau perubahan status autentikasi pengguna
   * Setiap kali terjadi perubahan (login/logout), akan menjalankan aksi yang sesuai
   */
  useEffect(() => {
    const onAuthStateChanged = (user: FirebaseAuthTypes.User | null) => {
      setUser(user); // Perbarui state pengguna
      if (user) {
        // Pengguna berhasil login
        // Ambil profil dari cache untuk tampilan yang cepat
        const profileString = storage.getString(PROFILE_STORAGE_KEY);
        if (profileString) {
          setMmkvProfile(JSON.parse(profileString));
        }
        // Kemudian ambil data mahasiswa
        fetchMahasiswa();
      } else {
        // Pengguna logout, bersihkan semua data
        setMmkvProfile(null);
        setMahasiswa([]);
      }

      // Hentikan loading screen setelah pengecekan status selesai
      if (initializing) {
        setInitializing(false);
      }
    };

    // Berlangganan sebagai listener untuk Firebase Auth
    const subscriber = auth().onAuthStateChanged(onAuthStateChanged);
    // Cleanup untuk mencegah memory leak saat komponen dilepas
    return subscriber;
  }, [initializing, fetchMahasiswa]);

  /**
   * Fungsi untuk menangani proses login pengguna
   */
  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Email dan password tidak boleh kosong.');
      return;
    }
    try {
      const userCredential = await auth().signInWithEmailAndPassword(email, password);
      
      // Buat objek profil dari data yang dikembalikan Firebase
      const userProfile: UserProfile = {
        uid: userCredential.user.uid,
        email: userCredential.user.email
      };

      // Simpan profil ke cache untuk akses cepat di sesi berikutnya
      storage.set(PROFILE_STORAGE_KEY, JSON.stringify(userProfile));
      setMmkvProfile(userProfile); // Perbarui state juga
      Alert.alert('Ntaps!', 'Login berhasil. Profil disimpan ke MMKV.');
      
      // Bersihkan form input
      setEmail('');
      setPassword('');

    } catch (error: any) {
      Alert.alert('Failed!!', error.message);
    }
  };

  /**
   * Fungsi untuk logout pengguna
   */
  const handleLogout = async () => {
    try {
      await auth().signOut();
      // Hapus semua data dari cache saat logout
      // Penting untuk keamanan, hindari sisa data dari sesi sebelumnya
      storage.remove(PROFILE_STORAGE_KEY);
      storage.remove(MAHASISWA_STORAGE_KEY);
      
      // Bersihkan state untuk reset total
      setMmkvProfile(null);
      setMahasiswa([]);
      Alert.alert('Sukses', 'Logout berhasil. Semua data cache telah dihapus.');
    } catch (error: any) {
      Alert.alert('Logout Gagal', error.message);
    }
  };

  // Loading screen saat aplikasi baru dibuka, sedang memeriksa status login
  if (initializing) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </SafeAreaView>
    );
  }

  // Tampilkan home jika sudah login, tampilkan login jika belum
  return (
    <SafeAreaView style={styles.safeArea}>
      {user ? (
        <HomeScreen
          user={user}
          mmkvProfile={mmkvProfile}
          mahasiswa={mahasiswa}
          loadingMahasiswa={loadingMahasiswa}
          fetchMahasiswa={fetchMahasiswa}
          handleLogout={handleLogout}
        />
      ) : (
        <LoginScreen
          email={email}
          password={password}
          setEmail={setEmail}
          setPassword={setPassword}
          handleLogin={handleLogin}
        />
      )}
    </SafeAreaView>
  );
};

// ================================================================
// STYLING 
// ================================================================
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: 'rgba(254, 255, 253, 1)', 
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center', 
    alignItems: 'center',
    backgroundColor: '#f1f7fdff',
  },
  loginContainer: {
    flex: 1,
    justifyContent: 'center', // Posisikan form login di tengah layar
    padding: 20,
    
  },
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    marginTop: 10,
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8, // Margin kecil agar tidak terlalu berjauhan
    color: '#101010ff',
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
    color: '#7b9c7dff',
  },
  subTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#343A40',
  },
  inputGroup: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    color: '#49574eff',
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    height: 50,
    backgroundColor: '#FFFFFF',
    borderColor: '#CED4DA',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 15,
    fontSize: 16,
    color: '#212529',
  },
  dataBox: {
    marginBottom: 20,
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  dataText: {
    fontSize: 14,
    color: '#495057',
    marginBottom: 4,
  },
  errorText: {
    color: '#D9534F',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 10,
  },
  mahasiswaHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  itemContainer: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E9ECEF',
  },
  itemTitle: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#212529',
  },
  itemDetails: {
    fontSize: 14,
    color: '#6C757D',
  },
  
});

export default App;