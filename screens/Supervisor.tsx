import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState, useRef } from 'react';
import { SafeAreaView, View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useAuth } from '../auth/AuthContext';
import { GridHeader } from '../components/grid/GridHeader';
import { GridRow } from '../components/grid/GridRow';
import { getWorkers } from '../repositories/users';
import { fetchWorkerOrdersForDate, fetchPendingSubmissions, fetchSubmissionLines, approveSubmission, updateSubmissionPayments } from '../repositories/submissions';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LabeledInput } from '../components/ui/LabeledInput';

const DEFAULT_SKUS: string[] = [
    'LARGE 350','ECO 800','HALF 150','POP 500','BR 400','FRT 200','H ATTA 200','MD 200','MG 400','VV 450','VV 250','H SLICE 450','600 GM','BR200','MG200','VV350','AT400','BUN70','AK','MK','BUR200','BUR190','PAV250','GAP300','B.BRW250','V450','CHD50','MP150','M BUN','SLICE',"D'nt Worry",'FINGER','TOAST','C.ROLL'
];

function SupMain() {
  const { logout } = useAuth();
  const db = useSQLiteContext();
  const [forDate] = useState<string>(() => new Date().toISOString().slice(0,10));
  const [rows, setRows] = useState<any[]>(() => DEFAULT_SKUS.map((name) => ({ name, jali:0, jaliQua:0, totalQua:0 })));
  const [focusedCell, setFocusedCell] = useState<{rowIndex: number, columnIndex: number} | null>(null);
  const gridRefs = useRef<{[key: string]: any}>({});

  function handleChange(rowIndex: number, key: string, text: string) {
    setRows((prev) => {
      const next = [...prev];
      const row: any = { ...next[rowIndex] };
      if (['jali','jaliQua'].includes(key)) row[key] = Number(text) || 0; else row[key] = text;
      row.totalQua = (Number(row.jali)||0) + (Number(row.jaliQua)||0);
      next[rowIndex] = row;
      return next;
    });
  }

  // Excel-like navigation: move to next row when Enter is pressed
  function handleEnterPress(rowIndex: number, columnIndex: number) {
    const nextRowIndex = rowIndex + 1;
    if (nextRowIndex < rows.length) {
      // Focus the same column in the next row
      setFocusedCell({ rowIndex: nextRowIndex, columnIndex });
      // Find the next editable cell in the same column
      const nextRowKey = `${nextRowIndex}-${columnIndex}`;
      setTimeout(() => {
        if (gridRefs.current[nextRowKey]) {
          gridRefs.current[nextRowKey].focus();
        }
      }, 100);
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>SUPERVISOR</Text>
        <Pressable onPress={logout} style={styles.signOutBtn}><Text style={styles.signOutText}>Sign out</Text></Pressable>
      </View>
      <View style={styles.gridArea}>
        <ScrollView horizontal bounces={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12 }}>
          <View style={styles.sheetContainer}>
            <GridHeader columns={[{ key: 'sr', title: 'SR.NO.', width: 70 }, { key: 'name', title: 'SKU NAME', width: 160 }, { key: 'jali', title: 'JALI', width: 90, align: 'right' as const, keyboard: 'numeric' as const }, { key: 'jaliQua', title: 'JALI QUA.', width: 110, align: 'right' as const, keyboard: 'numeric' as const }, { key: 'totalQua', title: 'TOTAL QUA.', width: 120, align: 'right' as const }]} />
            <ScrollView style={{ flex: 1 }}>
              {rows.map((row, idx) => (
                <GridRow 
                  key={row.name+idx} 
                  columns={[{ key: 'sr', title: 'SR.NO.', width: 70, editable: false }, { key: 'name', title: 'SKU NAME', width: 160, editable: false }, { key: 'jali', title: 'JALI', width: 90, align: 'right' as const, keyboard: 'numeric' as const }, { key: 'jaliQua', title: 'JALI QUA.', width: 110, align: 'right' as const, keyboard: 'numeric' as const }, { key: 'totalQua', title: 'TOTAL QUA.', width: 120, align: 'right' as const, editable: false }]} 
                  row={{ ...row, sr: idx+1 } as any} 
                  rowIndex={idx}
                  onChange={(k, v) => handleChange(idx, k, v)} 
                  onEnterPress={(columnIndex) => handleEnterPress(idx, columnIndex)}
                />
              ))}
            </ScrollView>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

function SupApprovals() {
  const db = useSQLiteContext();
  const [items, setItems] = useState<any[]>([]);
  const [date, setDate] = useState<Date | null>(null);
  const [showPicker, setShowPicker] = useState<boolean>(false);
  async function refresh(d: Date | null = date) {
    const rows = await fetchPendingSubmissions(db);
    if (d) { const day = d.toISOString().slice(0,10); setItems(rows.filter(r => r.for_date === day)); } else { setItems(rows); }
  }
  useEffect(() => { void refresh(null); }, []);
  useEffect(() => { void refresh(date); }, [date]);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '600' }}>Approvals</Text>
        <Pressable onPress={() => setShowPicker(true)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999 }}>
          <Text>{date ? date.toLocaleDateString() : 'All dates'}</Text>
        </Pressable>
        {showPicker ? (<DateTimePicker value={date ?? new Date()} mode="date" onChange={(e: any, d?: Date) => { setShowPicker(false); if (d) setDate(d); }} />) : null}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 16 }}>
        {items.map((s) => (
          <View key={s.id} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, backgroundColor: '#fff' }}>
            <Text style={{ fontWeight: '600' }}>{s.worker} • {s.for_date}</Text>
            <Text>Total: {s.total_amount} • Cash: {s.cash} • Online: {s.online} • Remaining: {s.remaining_due}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <Pressable onPress={async () => { await approveSubmission(db, s.id); await refresh(); }} style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#10b981', borderRadius: 8 }}>
                <Text style={{ color: 'white' }}>Approve</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function SupPayments() {
  const db = useSQLiteContext();
  const [items, setItems] = useState<any[]>([]);
  async function refresh() { setItems(await fetchPendingSubmissions(db)); }
  useEffect(() => { void refresh(); }, []);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#eee' }}>
        <Text style={{ fontSize: 16, fontWeight: '600' }}>Payments</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
        {items.map((s) => (
          <View key={s.id} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, backgroundColor: '#fff' }}>
            <Text style={{ fontWeight: '600' }}>{s.worker} • {s.for_date}</Text>
            <Text>Total: {s.total_amount}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const Tab = createBottomTabNavigator();

export default function Supervisor() {
  return (
    <NavigationContainer independent>
      <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: '#0ea5e9', tabBarStyle: { backgroundColor: '#fff' } }}>
        <Tab.Screen name="Main" component={SupMain} />
        <Tab.Screen name="Approval Data" component={SupApprovals} />
        <Tab.Screen name="Approval Payment" component={SupPayments} />
        <Tab.Screen name="Orders" component={() => <Text style={{ padding: 16 }}>Orders board available in Admin.</Text>} />
        <Tab.Screen name="Total" component={() => <Text style={{ padding: 16 }}>Totals available in Admin.</Text>} />
        <Tab.Screen name="Export" component={() => <Text style={{ padding: 16 }}>Export available in Admin.</Text>} />
        <Tab.Screen name="Settings" component={() => <Text style={{ padding: 16 }}>Settings available in Admin.</Text>} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  headerBar: { paddingTop: 18, paddingBottom: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  signOutBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#fff' },
  signOutText: { color: '#0f172a', fontWeight: '600' },
  gridArea: { flex: 1 },
  sheetContainer: { minWidth: 900, flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, overflow: 'hidden' },
});


