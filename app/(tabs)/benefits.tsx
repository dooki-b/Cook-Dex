import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors, Radius, Shadows } from '../../constants/design-tokens';

export default function BenefitsScreen() {
  const router = useRouter();
  const [myPoints, setMyPoints] = useState(1250);

  const benefitsItems = [
    { name: '프리미엄 레시피 1일 열람권', price: 500, icon: '🎫' },
    { name: '스타벅스 아메리카노 기프티콘', price: 4500, icon: '☕' },
    { name: '배달의민족 5천원 상품권', price: 5000, icon: '🛵' },
    { name: '신세계 백화점 5만원권', price: 45000, icon: '🛍️' },
  ];

  const buyItem = (itemName: string, price: number) => {
    if (myPoints < price) {
      Alert.alert(
        '포인트 부족 🥲',
        '포인트가 부족합니다. 퀘스트와 요리 인증을 통해 포인트를 모아보세요!',
      );
      return;
    }
    Alert.alert('교환 완료! 🎉', `${itemName} 상품을 교환했습니다! 쿠폰함에서 확인하세요.`);
    setMyPoints(prev => prev - price);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>뒤로가기</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>혜택 상점</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* 포인트 대시보드 */}
        <View style={styles.pointsCard}>
          <Text style={styles.pointsLabel}>보유 마이 포인트</Text>
          <View style={styles.pointsRow}>
            <Text style={styles.pointsValue}>{myPoints.toLocaleString()} P</Text>
            <Text style={styles.pointsIcon}>🪙</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>교환 가능한 상품</Text>

        <View style={styles.productsGrid}>
          {benefitsItems.map(item => {
            const canAfford = myPoints >= item.price;
            return (
              <View key={item.name} style={styles.productCard}>
                <Text style={styles.productIcon}>{item.icon}</Text>
                <Text style={styles.productName} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={styles.productPrice}>{item.price.toLocaleString()} P</Text>
                <TouchableOpacity
                  style={[styles.exchangeBtn, !canAfford && styles.exchangeBtnDisabled]}
                  onPress={() => canAfford && buyItem(item.name, item.price)}
                  activeOpacity={canAfford ? 0.85 : 1}
                >
                  <Text
                    style={[
                      styles.exchangeBtnText,
                      !canAfford && styles.exchangeBtnTextDisabled,
                    ]}
                  >
                    {canAfford ? '교환하기' : '포인트 부족'}
                  </Text>
                </TouchableOpacity>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bgMain,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.bgMain,
  },
  backBtn: {
    backgroundColor: Colors.bgElevated,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  backBtnText: {
    color: Colors.textSub,
    fontWeight: '600',
    fontSize: 13,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.textMain,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  pointsCard: {
    backgroundColor: Colors.primarySoft,
    paddingVertical: 22,
    paddingHorizontal: 20,
    borderRadius: Radius.xl,
    marginTop: 8,
    marginBottom: 24,
    ...Shadows.soft,
  },
  pointsLabel: {
    color: Colors.textSub,
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  pointsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  pointsValue: {
    color: Colors.textMain,
    fontSize: 32,
    fontWeight: '900',
  },
  pointsIcon: {
    fontSize: 24,
    color: Colors.primary,
  },
  sectionTitle: {
    color: Colors.textMain,
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 16,
  },
  productsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 16,
  },
  productCard: {
    width: '48%',
    backgroundColor: Colors.bgElevated,
    borderRadius: Radius.xl,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    ...Shadows.glass,
  },
  productIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  productName: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textMain,
    textAlign: 'center',
    marginBottom: 6,
  },
  productPrice: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.primary,
    marginBottom: 10,
  },
  exchangeBtn: {
    marginTop: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primary,
  },
  exchangeBtnDisabled: {
    backgroundColor: Colors.bgMuted,
  },
  exchangeBtnText: {
    color: Colors.textInverse,
    fontSize: 12,
    fontWeight: '800',
  },
  exchangeBtnTextDisabled: {
    color: Colors.textSub,
  },
});