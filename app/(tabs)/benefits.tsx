import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { Alert, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from 'react-native';

export default function BenefitsScreen() {
  const router = useRouter();
  const [myPoints, setMyPoints] = useState(1250);

  const buyItem = (itemName, price) => {
    if (myPoints < price) { 
      Alert.alert("포인트 부족 🥲", "포인트가 부족합니다. 퀘스트와 요리 인증을 통해 포인트를 모아보세요!"); 
      return; 
    }
    Alert.alert("교환 완료! 🎉", `${itemName} 상품을 교환했습니다! 쿠폰함에서 확인하세요.`);
    setMyPoints(prev => prev - price);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#2A2421' }}>
      <View style={{ padding: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <TouchableOpacity onPress={() => router.back()} style={{ backgroundColor: '#4A3F3A', padding: 10, borderRadius: 15 }}>
          <Text style={{ color: '#FFFDF9', fontWeight: 'bold' }}>뒤로가기</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 18, fontWeight: '900', color: '#FFFDF9' }}>혜택 상점</Text>
        <View style={{ width: 40 }} />
      </View>
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        <View style={{ backgroundColor: '#FF8C00', padding: 25, borderRadius: 20, alignItems: 'center', marginBottom: 30, shadowColor: '#FF8C00', shadowOpacity: 0.3, shadowRadius: 10, elevation: 5 }}>
          <Text style={{ color: '#3A2E2B', fontSize: 14, fontWeight: 'bold', marginBottom: 5 }}>보유 마이 포인트</Text>
          <Text style={{ color: '#000', fontSize: 36, fontWeight: '900' }}>{myPoints} P</Text>
        </View>
        <Text style={{ color: '#FFFDF9', fontSize: 18, fontWeight: 'bold', marginBottom: 15 }}>교환 가능한 상품</Text>
        
        {[ 
          { name: "프리미엄 레시피 1일 열람권", price: 500, icon: "🎫" }, 
          { name: "스타벅스 아메리카노 기프티콘", price: 4500, icon: "☕" }, 
          { name: "배달의민족 5천원 상품권", price: 5000, icon: "🛵" },
          { name: "신세계 백화점 5만원권", price: 45000, icon: "🛍️" }
        ].map((item, idx) => (
          <View key={idx} style={{ backgroundColor: '#3A322F', padding: 20, borderRadius: 16, marginBottom: 15, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#4A3F3A' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 30, marginRight: 15 }}>{item.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={{ color: '#FFFDF9', fontSize: 15, fontWeight: 'bold' }} numberOfLines={1}>{item.name}</Text>
                <Text style={{ color: '#FFB347', fontSize: 14, fontWeight: '900', marginTop: 5 }}>{item.price} P</Text>
              </View>
            </View>
            <TouchableOpacity style={{ backgroundColor: '#4CAF50', paddingVertical: 10, paddingHorizontal: 15, borderRadius: 12, marginLeft: 10 }} onPress={() => buyItem(item.name, item.price)}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>교환</Text>
            </TouchableOpacity>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}