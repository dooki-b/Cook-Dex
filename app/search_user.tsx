import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors, Radius, Shadows } from '../constants/design-tokens';

// 임시 Mock 데이터 - DB 연동 전까지 사용
const MOCK_USERS = [
  { id: 'user1', nickname: '김요리', title: '👨‍🍳 수석 셰프', level: 3 },
  { id: 'user2', nickname: '이초보', title: '🍳 요리 쪼렙', level: 1 },
  { id: 'user3', nickname: '박마스터', title: '👑 마스터 셰프', level: 'MAX' },
  { id: 'user4', nickname: '최장금', title: '🔪 견습 요리사', level: 2 },
];

export default function SearchUserScreen() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<typeof MOCK_USERS>([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    setHasSearched(true);
    const query = searchQuery.trim().toLowerCase();
    
    // 로컬 데이터 필터링
    const results = MOCK_USERS.filter(u => u.nickname.toLowerCase().includes(query));
    setSearchResults(results);
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color={Colors.textMain} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>셰프 검색</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.searchSection}>
          <View style={styles.searchInputWrap}>
            <Ionicons name="search" size={20} color={Colors.textSub} style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="유저 닉네임 검색"
              placeholderTextColor={Colors.textSub}
              value={searchQuery}
              onChangeText={setSearchQuery}
              onSubmitEditing={handleSearch}
              autoFocus
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearBtn}>
                <Ionicons name="close-circle" size={18} color={Colors.textSub} />
              </TouchableOpacity>
            )}
          </View>
        </View>

        <View style={styles.resultsContainer}>
          {searchResults.length > 0 ? (
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContainer}
              renderItem={({ item }) => (
                <TouchableOpacity 
                  style={styles.userCard}
                  activeOpacity={0.7}
                  onPress={() => router.push(`/user/${item.id}`)}
                >
                  <View style={styles.avatarWrap}>
                    <Text style={styles.avatarText}>{item.nickname[0]}</Text>
                  </View>
                  <View style={styles.userInfo}>
                    <Text style={styles.userTitle}>{item.title}</Text>
                    <Text style={styles.userNickname}>{item.nickname} 셰프</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={Colors.border} />
                </TouchableOpacity>
              )}
            />
          ) : hasSearched ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>👀</Text>
              <Text style={styles.emptyText}>해당 닉네임의 셰프를 찾을 수 없습니다.</Text>
            </View>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgMain,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    padding: 4,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textMain,
  },
  searchSection: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.pill,
    paddingHorizontal: 16,
    height: 48,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    height: '100%',
    color: Colors.textMain,
    fontSize: 16,
  },
  clearBtn: {
    padding: 4,
  },
  resultsContainer: {
    flex: 1,
  },
  listContainer: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.bgElevated,
    padding: 16,
    borderRadius: Radius.lg,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadows.soft,
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  avatarText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.textInverse,
  },
  userInfo: {
    flex: 1,
  },
  userTitle: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '700',
    marginBottom: 2,
  },
  userNickname: {
    fontSize: 16,
    fontWeight: 'bold',
    color: Colors.textMain,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
  },
  emptyEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSub,
    fontWeight: '600',
  },
});
