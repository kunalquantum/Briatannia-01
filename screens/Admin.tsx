import { useEffect, useMemo, useState, useRef } from 'react';
import { SafeAreaView, View, StyleSheet, Text, ScrollView, Pressable, Platform, Alert, KeyboardAvoidingView } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { GridHeader } from '../components/grid/GridHeader';
import { GridRow } from '../components/grid/GridRow';
import { useSQLiteContext } from 'expo-sqlite';
import { fetchPendingSubmissions, approveSubmission, updateSubmissionPayments, fetchPendingCount, fetchSubmissionLines, upsertSubmissionLineFull, updateSubmissionTotals, fetchApprovedTotalsBySku, fetchSubmissionsInRange, fetchLinesForSubmission, fetchTodaySubmissionStatus, clearPendingSubmissions, fetchMrRanking, upsertOrderTotal, getCarryoverForDate, fetchOrderTotalsByDate, getYesterdayRemarkPlusData, fetchLocationOrdersForDate, updateLocationOrder, updateLocationOrderWithSync, getLocationFromColumnKey, LOCATION_COLUMNS } from '../repositories/submissions';
import { expireOldPending } from '../repositories/submissions';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as XLSX from 'xlsx';
import DateTimePicker from '@react-native-community/datetimepicker';
import { LabeledInput } from '../components/ui/LabeledInput';
import { getWorkers, getWorkerDetails, updateUserLocation, deleteUser } from '../repositories/users';
import { getSkuSequence, getWorkerRates, setWorkerRate, setSkuSequence, setWorkerDbRate, getWorkerDbRates, applyRateToAllWorkers, applyDbRateToAllWorkers } from '../repositories/rates';
import { saveMainTableData, loadMainTableData, type MainTableData } from '../repositories/mainTable';
import { useAuth } from '../auth/AuthContext';

type Line = {
    name: string;
    jali?: number;
    jaliQua?: number;
    totalQua?: number; // computed: jali + jaliQua
    previousQua?: number;
};

const PRICING_COLUMNS = [
        { key: 'sr', title: 'SR', width: 40, align: 'right' as const, editable: false },
        { key: 'name', title: 'SKU', width: 80, color: '#8b4513', fontWeight: 'bold' as const, backgroundColor: '#f5f5dc' },
        { key: 'jali', title: 'TRAY', width: 50, align: 'right' as const, keyboard: 'numeric' as const, color: '#b8860b', fontWeight: 'bold' as const, backgroundColor: '#fffacd' },
        { key: 'jaliQua', title: 'TRAY QTY', width: 60, align: 'right' as const, keyboard: 'numeric' as const },
        { key: 'previousQua', title: 'PREV', width: 50, align: 'right' as const, keyboard: 'numeric' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
        { key: 'totalQua', title: 'TOTAL', width: 50, align: 'right' as const, editable: false, color: '#059669', fontWeight: 'bold' as const, backgroundColor: '#f0fdf4' },
];

const DEFAULT_SKUS: string[] = [
	'LARGE 350','ECO 800','HALF 150','POP 500','BR 400','FRT 200','H ATTA 200','MD 200','MG 400','WW 450','H SLICE 450','600 GM','BR 200','POP 250','MG 200','ATTA 400','BUM 70','A.KULCHA','M.KULCHA','BUR 200','BUR 100','PAV 250','GAR 300','BOMB.PAV','VAN 50','CHO 50','M PIZZA 150','M BUN','SLICE',"D'nt Worry",'FINGER','TOAST','C.ROLL'
];

// Main pricing table
export function AdminMain() {
    const { logout } = useAuth();
    const db = useSQLiteContext();
    const [forDate] = useState<string>(() => new Date().toISOString().slice(0,10));
    const [hideTrayQua, setHideTrayQua] = useState<boolean>(false);
    const [rows, setRows] = useState<Line[]>(() => {
        // Data from the spreadsheet
        const skuData: Record<string, { jali: number; jaliQua: number }> = {
            'LARGE 350': { jali: 24, jaliQua: 0 },
            'ECO 800': { jali: 15, jaliQua: 0 },
            'HALF 150': { jali: 48, jaliQua: 0 },
            'POP 500': { jali: 20, jaliQua: 0 },
            'BR 400': { jali: 24, jaliQua: 0 },
            'FRT 200': { jali: 35, jaliQua: 0 },
            'H ATTA 200': { jali: 48, jaliQua: 0 },
            'MD 200': { jali: 42, jaliQua: 0 },
            'MG 400': { jali: 24, jaliQua: 0 },
            'WW 450': { jali: 24, jaliQua: 0 },
            'H SLICE 450': { jali: 15, jaliQua: 0 },
            '600 GM': { jali: 14, jaliQua: 0 },
            'BR 200': { jali: 48, jaliQua: 0 },
            'POP 250': { jali: 20, jaliQua: 0 },
            'MG 200': { jali: 24, jaliQua: 0 },
            'ATTA 400': { jali: 24, jaliQua: 0 },
            'BUM 70': { jali: 20, jaliQua: 0 },
            'A.KULCHA': { jali: 9, jaliQua: 0 },
            'M.KULCHA': { jali: 9, jaliQua: 0 },
            'BUR 200': { jali: 6, jaliQua: 0 },
            'BUR 100': { jali: 20, jaliQua: 0 },
            'PAV 250': { jali: 16, jaliQua: 0 },
            'GAR 300': { jali: 12, jaliQua: 0 },
            'BOMB.PAV': { jali: 6, jaliQua: 0 },
            'VAN 50': { jali: 30, jaliQua: 0 },
            'CHO 50': { jali: 30, jaliQua: 0 },
            'M PIZZA 150': { jali: 12, jaliQua: 0 },
            'M BUN': { jali: 1, jaliQua: 0 },
            'SLICE': { jali: 1, jaliQua: 0 },
            "D'nt Worry": { jali: 1, jaliQua: 0 },
            'FINGER': { jali: 1, jaliQua: 0 },
            'TOAST': { jali: 0, jaliQua: 0 },
            'C.ROLL': { jali: 0, jaliQua: 0 }
        };
        
        return DEFAULT_SKUS.map((name) => {
            const data = skuData[name] || { jali: 0, jaliQua: 0 };
            const totalQua = (0 * data.jali) + 0; // Tray=0, TrayQua=data.jali, previousQua=0
            return { 
                name, 
                jali: 0, // TRAY column starts at 0
                jaliQua: data.jali, // TRAY QUA. gets the JALI values
                totalQua: totalQua, 
                previousQua: 0 
            };
        });
    });
    
    // Partition SKUs into main (up to M PIZZA 150) and extra products
    const mPizzaIndex = DEFAULT_SKUS.findIndex((n) => n === 'M PIZZA 150');
    const mainSkuNames = mPizzaIndex >= 0 ? DEFAULT_SKUS.slice(0, mPizzaIndex + 1) : DEFAULT_SKUS;
    const extraSkuNames = mPizzaIndex >= 0 ? DEFAULT_SKUS.slice(mPizzaIndex + 1) : [];
    const mainRows = rows.filter((r) => mainSkuNames.includes(r.name));
    const extraRows = rows.filter((r) => extraSkuNames.includes(r.name));
    
    // Filter columns based on hidden state - only hide TRAY QTY if requested
    const visibleColumns = PRICING_COLUMNS.filter(col => !(hideTrayQua && col.key === 'jaliQua'));
    const [focusedCell, setFocusedCell] = useState<{rowIndex: number, columnIndex: number} | null>(null);
    const gridRefs = useRef<{[key: string]: any}>({});
    const mainScrollRef = useRef<ScrollView>(null);
    const extraScrollRef = useRef<ScrollView>(null);
    const isScrolling = useRef<boolean>(false);
    
    // Synchronized scrolling handlers
    const handleMainScroll = (event: any) => {
        if (isScrolling.current) return;
        const scrollX = event.nativeEvent.contentOffset.x;
        isScrolling.current = true;
        if (extraScrollRef.current) {
            extraScrollRef.current.scrollTo({ x: scrollX, animated: false });
        }
        setTimeout(() => { isScrolling.current = false; }, 50);
    };
    
    const handleExtraScroll = (event: any) => {
        if (isScrolling.current) return;
        const scrollX = event.nativeEvent.contentOffset.x;
        isScrolling.current = true;
        if (mainScrollRef.current) {
            mainScrollRef.current.scrollTo({ x: scrollX, animated: false });
        }
        setTimeout(() => { isScrolling.current = false; }, 50);
    };
    
    useEffect(() => {
        (async () => {
            // Update database sequence to match the new DEFAULT_SKUS order
            for (let i = 0; i < DEFAULT_SKUS.length; i++) {
                await setSkuSequence(db, DEFAULT_SKUS[i], i + 1);
            }
            
            // Load saved data from database
            const savedData = await loadMainTableData(db);
            
            // Get yesterday's remark + data to populate today's previous column
            const yesterdayRemarkPlusData = await getYesterdayRemarkPlusData(db);
            
            const seq = await getSkuSequence(db);
            const ordered = seq && seq.length > 0 ? seq.map((s: any) => s.name) : [];
            const missing = DEFAULT_SKUS.filter((n) => !ordered.includes(n));
            const finalOrder = [...ordered, ...missing];
            setRows((prev) => {
                const map: Record<string, any> = {}; prev.forEach((r) => (map[r.name] = r));
                return finalOrder.map((n) => {
                    const saved = savedData[n];
                    const yesterdayPlus = yesterdayRemarkPlusData[n] || 0;
                    
                    if (saved) {
                        return {
                            name: n,
                            jali: saved.jali,
                            jaliQua: saved.jali_qua,
                            totalQua: saved.total_qua,
                            previousQua: yesterdayPlus > 0 ? yesterdayPlus : saved.previous_qua
                        };
                    }
                    return map[n] ?? { name: n, jali: 0, jaliQua: 0, totalQua: 0, previousQua: yesterdayPlus };
                });
            });
        })();
    }, [db]);

    const totals = useMemo(() => {
        const jali = mainRows.reduce((s, r) => s + (Number(r.jali) || 0), 0);
        const jaliQua = mainRows.reduce((s, r) => s + (Number(r.jaliQua) || 0), 0);
        const totalQua = mainRows.reduce((s, r) => s + (Number(r.totalQua) || 0), 0);
        const previousQua = mainRows.reduce((s, r) => s + (Number(r.previousQua) || 0), 0);
        const extraJali = extraRows.reduce((s, r) => s + (Number(r.jali) || 0), 0);
        const extraJaliQua = extraRows.reduce((s, r) => s + (Number(r.jaliQua) || 0), 0);
        const extraTotalQua = extraRows.reduce((s, r) => s + (Number(r.totalQua) || 0), 0);
        const extraPreviousQua = extraRows.reduce((s, r) => s + (Number(r.previousQua) || 0), 0);
        return { jali, jaliQua, totalQua, previousQua, extraJali, extraJaliQua, extraTotalQua, extraPreviousQua };
    }, [mainRows, extraRows]);

    async function handleChange(rowIndex: number, key: string, text: string) {
        setRows((prev) => {
            const next = [...prev];
            const row = { ...next[rowIndex] } as any;
            if (['jali','jaliQua','previousQua'].includes(key)) {
                row[key] = Number(text) || 0;
            } else {
                row[key] = text;
            }
            // compute total quantity: (jali * jaliQua) + previousQua
            row.totalQua = (Number(row.jali) || 0) * (Number(row.jaliQua) || 0) + (Number(row.previousQua) || 0);
            next[rowIndex] = row as Line;
            
            // Save to database when editable fields change
            if (['jali','jaliQua','previousQua'].includes(key)) {
                saveMainTableData(db, {
                    sku_name: row.name,
                    jali: Number(row.jali) || 0,
                    jali_qua: Number(row.jaliQua) || 0,
                    previous_qua: Number(row.previousQua) || 0,
                    total_qua: Number(row.totalQua) || 0
                }).catch(console.error);
            }
            
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
				<Text style={styles.headerTitle}>ADMIN</Text>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
					<Pressable onPress={() => {
						// Toggle TRAY QTY column visibility
						setHideTrayQua(prev => !prev);
					}} style={styles.columnToggleBtn}>
						<Text style={styles.columnToggleText}>{hideTrayQua ? 'Show TRAY QTY' : 'Hide TRAY QTY'}</Text>
					</Pressable>
				<Pressable onPress={logout} style={styles.signOutBtn}>
					<Text style={styles.signOutText}>Sign out</Text>
				</Pressable>
				</View>
			</View>
			<KeyboardAvoidingView 
				style={styles.gridArea} 
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
			>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12 }} keyboardShouldPersistTaps="handled">
                    {/* Main Products Section */}
                    <ScrollView 
                        ref={mainScrollRef}
                        horizontal 
                        bounces={false} 
                        style={{ flex: 1 }} 
                        contentContainerStyle={{ paddingBottom: 12 }}
                        onScroll={handleMainScroll}
                        scrollEventThrottle={16}
                    >
					<View style={styles.sheetContainer}>
                            <GridHeader columns={visibleColumns} />
						<View style={{ flex: 1 }}>
							<ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                                    {mainRows.map((row, idx) => {
                                        const actualIndex = rows.findIndex(r => r.name === row.name);
                                        return (
									<GridRow
										key={row.name + idx}
                                                columns={visibleColumns}
                                        row={{ ...row, sr: idx + 1 } as any}
                                                rowIndex={actualIndex}
                                                onChange={(key, val) => handleChange(actualIndex, key, val)}
                                                onEnterPress={(columnIndex) => handleEnterPress(actualIndex, columnIndex)}
                                            />
                                        );
                                    })}
							</ScrollView>
						</View>
                        <View style={styles.footerRow}>
                                {visibleColumns.map((col, idx) => {
                                    if (col.key === 'sr') return <Text key={col.key} style={[styles.footerCell, { width: col.width }]} />;
                                    if (col.key === 'name') return <Text key={col.key} style={[styles.footerCell, { width: col.width }]}>Main Totals</Text>;
                                    if (col.key === 'jali') return <Text key={col.key} style={[styles.footerCell, { width: col.width, textAlign: 'right' }]}>{totals.jali}</Text>;
                                    if (col.key === 'jaliQua') return <Text key={col.key} style={[styles.footerCell, { width: col.width, textAlign: 'right' }]}>{totals.jaliQua}</Text>;
                                    if (col.key === 'previousQua') return <Text key={col.key} style={[styles.footerCell, { width: col.width, textAlign: 'right' }]}>{totals.previousQua}</Text>;
                                    if (col.key === 'totalQua') return <Text key={col.key} style={[styles.footerCell, { width: col.width, textAlign: 'right' }]}>{totals.totalQua}</Text>;
                                    return null;
                                })}
                        </View>
					</View>
                    </ScrollView>

                    {/* Extra Products Section */}
                    {extraRows.length > 0 && (
                        <View style={{ marginTop: 12 }}>
                            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8, paddingHorizontal: 4 }}>Extra Products</Text>
                            <ScrollView 
                                ref={extraScrollRef}
                                horizontal 
                                bounces={false} 
                                style={{ flex: 1 }} 
                                contentContainerStyle={{ paddingBottom: 12 }}
                                onScroll={handleExtraScroll}
                                scrollEventThrottle={16}
                            >
                                <View style={styles.sheetContainer}>
                                    <GridHeader columns={visibleColumns} />
                                    <View style={{ flex: 1 }}>
                                        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                                            {extraRows.map((row, idx) => {
                                                const actualIndex = rows.findIndex(r => r.name === row.name);
                                                return (
                                                    <GridRow
                                                        key={row.name + idx}
                                                        columns={visibleColumns}
                                                        row={{ ...row, sr: idx + 1 } as any}
                                                        rowIndex={actualIndex}
                                                        onChange={(key, val) => handleChange(actualIndex, key, val)}
                                                        onEnterPress={(columnIndex) => handleEnterPress(actualIndex, columnIndex)}
                                                    />
                                                );
                                            })}
                                        </ScrollView>
                                    </View>
                                    <View style={styles.footerRow}>
                                        {visibleColumns.map((col, idx) => {
                                            if (col.key === 'sr') return <Text key={col.key} style={[styles.footerCell, { width: col.width }]} />;
                                            if (col.key === 'name') return <Text key={col.key} style={[styles.footerCell, { width: col.width }]}>Extra Totals</Text>;
                                            if (col.key === 'jali') return <Text key={col.key} style={[styles.footerCell, { width: col.width, textAlign: 'right' }]}>{totals.extraJali}</Text>;
                                            if (col.key === 'jaliQua') return <Text key={col.key} style={[styles.footerCell, { width: col.width, textAlign: 'right' }]}>{totals.extraJaliQua}</Text>;
                                            if (col.key === 'previousQua') return <Text key={col.key} style={[styles.footerCell, { width: col.width, textAlign: 'right' }]}>{totals.extraPreviousQua}</Text>;
                                            if (col.key === 'totalQua') return <Text key={col.key} style={[styles.footerCell, { width: col.width, textAlign: 'right' }]}>{totals.extraTotalQua}</Text>;
                                            return null;
                                        })}
                                    </View>
                                </View>
                            </ScrollView>
                        </View>
                    )}
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	);
}

// Orders board (dynamic columns per worker)
export function AdminOrders() {
    const { logout } = useAuth();
    const db = useSQLiteContext();
    const [forDate] = useState<string>(() => new Date().toISOString().slice(0,10));
    const [rows, setRows] = useState<any[]>(() => DEFAULT_SKUS.map((name) => ({ name })));
    const [focusedCell, setFocusedCell] = useState<{rowIndex: number, columnIndex: number} | null>(null);
    const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
    const gridRefs = useRef<{[key: string]: any}>({});
    
    // Jali values from main table - this should match the main table data
    const jaliValues: Record<string, number> = {
        'LARGE 350': 24, 'ECO 800': 15, 'HALF 150': 48, 'POP 500': 20, 'BR 400': 24,
        'FRT 200': 35, 'H ATTA 200': 48, 'MD 200': 42, 'MG 400': 24, 'WW 450': 24,
        'H SLICE 450': 15, '600 GM': 14, 'BR 200': 48, 'POP 250': 20, 'MG 200': 24,
        'ATTA 400': 24, 'BUM 70': 20, 'A.KULCHA': 9, 'M.KULCHA': 9, 'BUR 200': 6,
        'BUR 100': 20, 'PAV 250': 16, 'GAR 300': 12, 'BOMB.PAV': 6, 'VAN 50': 30,
        'CHO 50': 30, 'M PIZZA 150': 12, 'M BUN': 1, 'SLICE': 1, "D'nt Worry": 1,
        'FINGER': 1, 'TOAST': 0, 'C.ROLL': 0
    };

    useMemo(() => {
        (async () => {
            console.log(`Loading Admin Orders data for date: ${forDate}`);
            const rowMap: Record<string, any> = {};
            for (const name of DEFAULT_SKUS) rowMap[name] = { name };
            
            // Load location orders from the new location_orders table
            const locationOrders = await fetchLocationOrdersForDate(db, forDate);
            console.log(`Found ${locationOrders.length} location orders for ${forDate}`);
            
            // Prefill carryover from yesterday into remark / will also initialize total_qty to carryover
            const carry = await getCarryoverForDate(db, forDate);
            
            // Get yesterday's extra orders to populate today's previous balance
            const yesterdayExtraOrders = await getYesterdayExtraOrders(db, forDate);
            
            // Populate location orders data
            locationOrders.forEach((order) => {
                if (rowMap[order.sku_name]) {
                    console.log(`Loading order data for ${order.sku_name}:`, {
                        prabhadevi_1: order.prabhadevi_1,
                        prabhadevi_2: order.prabhadevi_2,
                        parel: order.parel,
                        saat_rasta: order.saat_rasta,
                        sea_face: order.sea_face,
                        worli_bdd: order.worli_bdd,
                        worli_mix: order.worli_mix,
                        matunga: order.matunga,
                        mahim: order.mahim,
                        koli_wada: order.koli_wada
                    });
                    
                    rowMap[order.sku_name] = {
                        ...rowMap[order.sku_name],
                        prabhadevi_1: order.prabhadevi_1 || 0,
                        prabhadevi_2: order.prabhadevi_2 || 0,
                        parel: order.parel || 0,
                        saat_rasta: order.saat_rasta || 0,
                        sea_face: order.sea_face || 0,
                        worli_bdd: order.worli_bdd || 0,
                        worli_mix: order.worli_mix || 0,
                        matunga: order.matunga || 0,
                        mahim: order.mahim || 0,
                        koli_wada: order.koli_wada || 0,
                        previous_balance: order.previous_balance || 0
                    };
                }
            });
            
            Object.keys(rowMap).forEach((name) => {
                const c = carry[name] || 0;
                if (c) {
                    rowMap[name].total_qty = Number(rowMap[name].total_qty || 0) + c;
                    rowMap[name].carryover = c;
                }
                
                // Set previous balance from yesterday's extra order if not already set
                if (!rowMap[name].previous_balance) {
                    const yesterdayExtra = yesterdayExtraOrders[name] || 0;
                    if (yesterdayExtra > 0) {
                        rowMap[name].previous_balance = yesterdayExtra;
                    }
                }
                
                // Initialize remark color for each row
                recomputeRemark(rowMap[name]);
            });
            setRows(Object.values(rowMap));
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db, forDate]);

    const dynamicColumns = useMemo(() => {
        return [
            { key: 'name', title: 'SKU NAME', width: 160 },
            { key: 'previous_balance', title: 'PREV BAL', width: 60, align: 'right' as const, keyboard: 'numeric' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
            { key: 'prabhadevi_1', title: 'PRABHADEVI\n1', width: 60, align: 'right' as const, keyboard: 'numeric' as const },
            { key: 'prabhadevi_2', title: 'PRABHADEVI\n2', width: 60, align: 'right' as const, keyboard: 'numeric' as const },
            { key: 'parel', title: 'PAREL', width: 60, align: 'right' as const, keyboard: 'numeric' as const },
            { key: 'saat_rasta', title: 'SAAT\nRASTA', width: 60, align: 'right' as const, keyboard: 'numeric' as const },
            { key: 'sea_face', title: 'SEA\nFACE', width: 60, align: 'right' as const, keyboard: 'numeric' as const },
            { key: 'worli_bdd', title: 'WORLI\nB.D.D', width: 60, align: 'right' as const, keyboard: 'numeric' as const },
            { key: 'worli_mix', title: 'WORLI\nMIX', width: 60, align: 'right' as const, keyboard: 'numeric' as const },
            { key: 'matunga', title: 'MATUNGA', width: 60, align: 'right' as const, keyboard: 'numeric' as const },
            { key: 'mahim', title: 'MAHIM', width: 60, align: 'right' as const, keyboard: 'numeric' as const },
            { key: 'koli_wada', title: 'KOLI\nWADA', width: 60, align: 'right' as const, keyboard: 'numeric' as const },
            { key: 'total_qty', title: 'TOTAL\nQTY', width: 60, align: 'right' as const, editable: false, color: '#059669', fontWeight: 'bold' as const, backgroundColor: '#f0fdf4' },
            { key: 'total_order', title: 'TOTAL\nORDER', width: 60, align: 'right' as const, editable: false, color: '#7c3aed', fontWeight: 'bold' as const, backgroundColor: '#f3f0ff' },
            { key: 'remark', title: 'REMARK', width: 80, colorKey: 'remarkColor', backgroundColorKey: 'remarkBackgroundColor', fontWeightKey: 'remarkFontWeight' },
        ];
    }, []);

    function recomputeRemark(row: any) {
        // Calculate total orders from all location columns
        const locationColumns = ['prabhadevi_1', 'prabhadevi_2', 'parel', 'saat_rasta', 'sea_face', 'worli_bdd', 'worli_mix', 'matunga', 'mahim', 'koli_wada'];
        const locationOrders = locationColumns.reduce((s, col) => s + (Number(row[col]) || 0), 0);
        
        // Get previous balance
        const previousBalance = Number(row.previous_balance) || 0;
        
        // TOTAL QTY = only location orders (previous balance NOT included in total quantity)
        row.total_qty = locationOrders;
        
        // Calculate total order based on total quantity (location orders + previous balance)
        const jali = jaliValues[row.name] || 1;
        if (jali > 0) {
            // Total order = floor(total quantity / jali) - whole number of trays
            row.total_order = Math.floor(row.total_qty / jali);
        } else {
            row.total_order = 0;
        }
        
        // REMARK logic: Show extra remaining and previous balance
        const extraRemaining = row.total_qty % jali; // Extra after dividing total quantity by jali
        
        let remarkParts = [];
        
        // Add extra remaining with + sign if > 0
        if (extraRemaining > 0) {
            remarkParts.push(`+${extraRemaining}`);
        }
        
        // Add previous balance with - sign if != 0
        if (previousBalance !== 0) {
            remarkParts.push(`-${Math.abs(previousBalance)}`);
        }
        
        // Set remark
        if (remarkParts.length === 0) {
            row.remark = '0';
            row.remarkColor = undefined;
            row.remarkBackgroundColor = undefined;
            row.remarkFontWeight = undefined;
        } else {
            row.remark = remarkParts.join(' ');
            
            // Check if remark contains + sign (extra remaining)
            const hasExtra = remarkParts.some(part => part.startsWith('+'));
            
            if (hasExtra) {
                // Green background, red text, bold for + sign
                row.remarkColor = '#ef4444'; // Red text
                row.remarkBackgroundColor = '#10b981'; // Green background
                row.remarkFontWeight = 'bold';
            } else {
                // Color based on previous balance only
                if (previousBalance > 0) {
                    row.remarkColor = '#10b981'; // Green for positive previous balance
                    row.remarkBackgroundColor = undefined;
                    row.remarkFontWeight = undefined;
                } else if (previousBalance < 0) {
                    row.remarkColor = '#ef4444'; // Red for negative previous balance
                    row.remarkBackgroundColor = undefined;
                    row.remarkFontWeight = undefined;
                } else {
                    row.remarkColor = '#7c3aed'; // Purple for extra only
                    row.remarkBackgroundColor = undefined;
                    row.remarkFontWeight = undefined;
                }
            }
        }
    }

    async function handleCellChange(rowIndex: number, key: string, text: string) {
        const locationColumns = ['previous_balance', 'prabhadevi_1', 'prabhadevi_2', 'parel', 'saat_rasta', 'sea_face', 'worli_bdd', 'worli_mix', 'matunga', 'mahim', 'koli_wada'];
        const isNumeric = locationColumns.includes(key);
        const nextVal = isNumeric ? (Number(text) || 0) : text;
        
        // Auto-select row when editing
        setSelectedRowIndex(rowIndex);
        
        setRows((prev) => {
            const next = [...prev];
            const updated = { ...next[rowIndex], [key]: nextVal } as any;
            recomputeRemark(updated);
            next[rowIndex] = updated;
            return next;
        });
        
        // Update database with new location orders
        if (locationColumns.includes(key)) {
            const r = rows[rowIndex] as any;
            
            // Update the specific location column in location_orders table and sync to worker SKU
            if (key !== 'previous_balance') {
                const location = getLocationFromColumnKey(key);
                if (location) {
                    await updateLocationOrderWithSync(db, forDate, r.name, location, Number(nextVal) || 0);
                    console.log(`Updated ${r.name} for ${location}: ${nextVal} and synced to worker SKU`);
                } else {
                    // Fallback to old method if location mapping fails
                    await updateLocationOrder(db, forDate, r.name, key, Number(nextVal) || 0);
                }
            }
            
            // Also update the legacy order_totals for backward compatibility
            const locationOrders = locationColumns.filter(col => col !== 'previous_balance').reduce((s, col) => s + (Number(r[col]) || 0), 0);
            await upsertOrderTotal(db, forDate, r.name, locationOrders, 0);
            
            // Store extra order for tomorrow's previous balance
            const totalQuantity = locationOrders + (Number(r.previous_balance) || 0);
            const jali = jaliValues[r.name] || 1;
            const extraOrder = jali > 0 ? totalQuantity % jali : 0;
            await storeExtraOrderForDate(db, forDate, r.name, extraOrder);
            
            // Store remark + data for tomorrow's main table previous column
            const remarkPlusData = jali > 0 ? locationOrders % jali : 0;
            if (remarkPlusData > 0) {
                await storeRemarkPlusDataForDate(db, forDate, r.name, remarkPlusData);
            }
        }
    }
    
    const handleRowSelect = (rowIndex: number) => {
        setSelectedRowIndex(selectedRowIndex === rowIndex ? null : rowIndex);
    };
    
    // Store extra order for a specific date and SKU
    async function storeExtraOrderForDate(db: any, date: string, skuName: string, extraOrder: number) {
        try {
            await db.runAsync(
                `INSERT OR REPLACE INTO extra_orders (date, sku_name, extra_order) VALUES (?, ?, ?)`,
                [date, skuName, extraOrder]
            );
        } catch (error) {
            console.error('Error storing extra order:', error);
        }
    }
    
    // Store remark + data for tomorrow's main table previous column
    async function storeRemarkPlusDataForDate(db: any, date: string, skuName: string, remarkPlusData: number) {
        try {
            await db.runAsync(
                `INSERT OR REPLACE INTO remark_plus_data (date, sku_name, remark_plus_value) VALUES (?, ?, ?)`,
                [date, skuName, remarkPlusData]
            );
        } catch (error) {
            console.error('Error storing remark + data:', error);
        }
    }
    
    // Get extra orders from yesterday for today's previous balance
    async function getYesterdayExtraOrders(db: any, todayDate: string) {
        try {
            const yesterday = new Date(todayDate);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toISOString().slice(0, 10);
            
            const result = await db.getAllAsync(
                `SELECT sku_name, extra_order FROM extra_orders WHERE date = ?`,
                [yesterdayStr]
            );
            
            const extraOrdersMap: Record<string, number> = {};
            result.forEach((row: any) => {
                extraOrdersMap[row.sku_name] = row.extra_order;
            });
            
            return extraOrdersMap;
        } catch (error) {
            console.error('Error getting yesterday extra orders:', error);
            return {};
        }
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
                <Text style={styles.headerTitle}>ORDERS</Text>
                <Pressable onPress={logout} style={styles.signOutBtn}>
                    <Text style={styles.signOutText}>Sign out</Text>
                </Pressable>
            </View>
            <KeyboardAvoidingView 
                style={[styles.gridArea, { marginBottom: 200 }]} 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={0}
            >
                <ScrollView horizontal bounces={false} style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12 }}>
                    <View style={styles.sheetContainer}>
                        <GridHeader columns={dynamicColumns} />
                        <View style={{ flex: 1, maxHeight: 400 }}>
                            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                                {rows.map((row, idx) => (
                                    <GridRow
                                        key={row.name + idx}
                                        columns={dynamicColumns}
                                        row={row as any}
                                        rowIndex={idx}
                                        onChange={(key, val) => { void handleCellChange(idx, key, val); }}
                                        onEnterPress={(columnIndex) => handleEnterPress(idx, columnIndex)}
                                        onRowPress={() => handleRowSelect(idx)}
                                        isSelected={selectedRowIndex === idx}
                                    />
                                ))}
                            </ScrollView>
                        </View>
                        {/* Totals Row */}
                        <View style={styles.totalsRow}>
                            <Text style={[styles.totalsCell, { width: 160, fontWeight: 'bold' }]}>TOTALS</Text>
                            <Text style={[styles.totalsCell, { width: 60, textAlign: 'right', fontWeight: 'bold' }]}>
                                {rows.reduce((sum, row) => sum + (Number(row.previous_balance) || 0), 0)}
                            </Text>
                            <Text style={[styles.totalsCell, { width: 60, textAlign: 'right', fontWeight: 'bold' }]}>
                                {rows.reduce((sum, row) => sum + (Number(row.prabhadevi_1) || 0), 0)}
                            </Text>
                            <Text style={[styles.totalsCell, { width: 60, textAlign: 'right', fontWeight: 'bold' }]}>
                                {rows.reduce((sum, row) => sum + (Number(row.prabhadevi_2) || 0), 0)}
                            </Text>
                            <Text style={[styles.totalsCell, { width: 60, textAlign: 'right', fontWeight: 'bold' }]}>
                                {rows.reduce((sum, row) => sum + (Number(row.parel) || 0), 0)}
                            </Text>
                            <Text style={[styles.totalsCell, { width: 60, textAlign: 'right', fontWeight: 'bold' }]}>
                                {rows.reduce((sum, row) => sum + (Number(row.saat_rasta) || 0), 0)}
                            </Text>
                            <Text style={[styles.totalsCell, { width: 60, textAlign: 'right', fontWeight: 'bold' }]}>
                                {rows.reduce((sum, row) => sum + (Number(row.sea_face) || 0), 0)}
                            </Text>
                            <Text style={[styles.totalsCell, { width: 60, textAlign: 'right', fontWeight: 'bold' }]}>
                                {rows.reduce((sum, row) => sum + (Number(row.worli_bdd) || 0), 0)}
                            </Text>
                            <Text style={[styles.totalsCell, { width: 60, textAlign: 'right', fontWeight: 'bold' }]}>
                                {rows.reduce((sum, row) => sum + (Number(row.worli_mix) || 0), 0)}
                            </Text>
                            <Text style={[styles.totalsCell, { width: 60, textAlign: 'right', fontWeight: 'bold' }]}>
                                {rows.reduce((sum, row) => sum + (Number(row.matunga) || 0), 0)}
                            </Text>
                            <Text style={[styles.totalsCell, { width: 60, textAlign: 'right', fontWeight: 'bold' }]}>
                                {rows.reduce((sum, row) => sum + (Number(row.mahim) || 0), 0)}
                            </Text>
                            <Text style={[styles.totalsCell, { width: 60, textAlign: 'right', fontWeight: 'bold' }]}>
                                {rows.reduce((sum, row) => sum + (Number(row.koli_wada) || 0), 0)}
                            </Text>
                            <Text style={[styles.totalsCell, { width: 60, textAlign: 'right', fontWeight: 'bold', color: '#059669' }]}>
                                {rows.reduce((sum, row) => sum + (Number(row.total_qty) || 0), 0)}
                            </Text>
                            <Text style={[styles.totalsCell, { width: 60, textAlign: 'right', fontWeight: 'bold', color: '#7c3aed' }]}>
                                {rows.reduce((sum, row) => sum + (Number(row.total_order) || 0), 0)}
                            </Text>
                            <Text style={[styles.totalsCell, { width: 80, textAlign: 'center', fontWeight: 'bold' }]}>
                                -
                            </Text>
                        </View>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

export function ApprovalsTab() {
    const db = useSQLiteContext();
    const [items, setItems] = useState<any[]>([]);
    const [date, setDate] = useState<Date | null>(null);
    const [showPicker, setShowPicker] = useState<boolean>(false);
    const [selectedSubmission, setSelectedSubmission] = useState<any>(null);
    const [approvalData, setApprovalData] = useState<any[]>([]);
    const [showApprovalTable, setShowApprovalTable] = useState(false);
    const [totals, setTotals] = useState<{ sku: number; mr: number; fr: number; sale: number; amount: number; order: number; remarkLeft: number }>({ sku:0, mr:0, fr:0, sale:0, amount:0, order:0, remarkLeft:0 });
    
    async function refresh(d: Date | null = date) {
        const rows = await fetchPendingSubmissions(db);
        if (d) {
            const day = d.toISOString().slice(0,10);
            const filtered = rows.filter(r => r.for_date === day);
            
            // Group by location and keep only the most recent submission for each location
            const locationMap = new Map();
            filtered.forEach(submission => {
                const location = submission.location || 'No Location';
                const existing = locationMap.get(location);
                if (!existing || new Date(submission.created_at || submission.id) > new Date(existing.created_at || existing.id)) {
                    locationMap.set(location, submission);
                }
            });
            
            const stackedItems = Array.from(locationMap.values());
            setItems(stackedItems);
            
            // compute totals across all submission lines + compare with order_totals
            let skuSum=0, mrSum=0, frSum=0, saleSum=0, amtSum=0, orderSum=0, remarkLeft=0;
            for (const s of stackedItems) {
                const lines = await fetchSubmissionLines(db, s.id);
                for (const l of lines) {
                    skuSum += Number(l.sku)||0; mrSum += Number(l.mr)||0; frSum += Number(l.fr)||0; saleSum += Number(l.sale)||0; amtSum += Number(l.amount)||0; orderSum += Number(l.ordering)||0;
                }
            }
            const ordersMap = await fetchOrderTotalsByDate(db, day);
            const dayTotalQty = Object.values(ordersMap).reduce((a,b)=>a+(Number(b)||0),0);
            remarkLeft = dayTotalQty - orderSum;
            setTotals({ sku: skuSum, mr: mrSum, fr: frSum, sale: saleSum, amount: amtSum, order: orderSum, remarkLeft });
        } else {
            // For "all dates", also stack by location
            const locationMap = new Map();
            rows.forEach(submission => {
                const location = submission.location || 'No Location';
                const existing = locationMap.get(location);
                if (!existing || new Date(submission.created_at || submission.id) > new Date(existing.created_at || existing.id)) {
                    locationMap.set(location, submission);
                }
            });
            
            const stackedItems = Array.from(locationMap.values());
            setItems(stackedItems);
            setTotals({ sku:0, mr:0, fr:0, sale:0, amount:0, order:0, remarkLeft:0 });
        }
    }

    async function loadDetailedApproval(submission: any) {
        const { fetchDetailedSubmissionForApproval } = await import('../repositories/submissions');
        const data = await fetchDetailedSubmissionForApproval(db, submission.id);
        setApprovalData(data);
        setSelectedSubmission(submission);
        setShowApprovalTable(true);
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
                {showPicker ? (
                    <DateTimePicker value={date ?? new Date()} mode="date" onChange={(e: any, d?: Date) => { setShowPicker(false); if (d) setDate(d); }} />
                ) : null}
                <Pressable onPress={async () => { 
                    const { Alert } = await import('react-native');
                    Alert.alert('Clear pending?', 'This will permanently delete pending submissions for the selected date (or all dates if none selected).', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'OK', style: 'destructive', onPress: async () => { await clearPendingSubmissions(db, date ? date.toISOString().slice(0,10) : null); setItems([]); await refresh(date || null); } },
                    ]);
                }} style={{ paddingHorizontal: 12, paddingVertical: 8, marginLeft: 8 }}>
                    <Text>Clear</Text>
                </Pressable>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
                {items.map((s) => (
                    <View key={s.id} style={{ 
                        borderWidth: 1, 
                        borderColor: '#e5e7eb', 
                        borderRadius: 8, 
                        padding: 12, 
                        marginBottom: 12,
                        backgroundColor: '#f9fafb'
                    }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <View>
                                <Text style={{ fontWeight: '600', fontSize: 16 }}>{s.worker}</Text>
                                <Text style={{ color: '#3b82f6', fontSize: 12, fontWeight: '500' }}>{s.location || 'No Location'}</Text>
                            </View>
                            <Text style={{ color: '#6b7280', fontSize: 12 }}>{s.for_date}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={{ fontSize: 12 }}>Amount: ₹{s.total_amount?.toFixed(2) || '0.00'}</Text>
                            <Text style={{ fontSize: 12 }}>Cash: ₹{s.cash || '0.00'}</Text>
                            <Text style={{ fontSize: 12 }}>Online: ₹{s.online || '0.00'}</Text>
                        </View>
                        <Pressable 
                            onPress={() => loadDetailedApproval(s)}
                            style={{ 
                                backgroundColor: '#3b82f6', 
                                paddingHorizontal: 12, 
                                paddingVertical: 8, 
                                borderRadius: 6,
                                alignSelf: 'flex-start'
                            }}
                        >
                            <Text style={{ color: 'white', fontWeight: '500' }}>Open Detailed Table</Text>
                        </Pressable>
                    </View>
                ))}
                {items.length === 0 ? <Text style={{ textAlign: 'center', color: '#6b7280', marginTop: 20 }}>No pending submissions.</Text> : null}
                {items.length > 0 && (
                    <View style={{ marginTop: 12, borderTopWidth:1, borderColor:'#eee', paddingTop: 12 }}>
                        <Text style={{ fontWeight: '700', marginBottom: 6 }}>Totals for selected date</Text>
                        <Text>SKU: {totals.sku} • MR: {totals.mr} • FR: {totals.fr} • SALE: {totals.sale} • AMOUNT: {totals.amount.toFixed(2)} • ORDER: {totals.order} • REMARK (TotalQty - Submitted): {totals.remarkLeft}</Text>
                    </View>
                )}
            </ScrollView>
            
            {showApprovalTable && selectedSubmission && (
                <View style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    bottom: 0, 
                    backgroundColor: 'rgba(0,0,0,0.5)', 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    zIndex: 1000
                }}>
                    <View style={{ 
                        backgroundColor: 'white', 
                        width: '95%', 
                        height: '90%', 
                        borderRadius: 12, 
                        padding: 16 
                    }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <View>
                                <Text style={{ fontSize: 18, fontWeight: '600' }}>Detailed Approval Review</Text>
                                <Text style={{ fontSize: 14, color: '#6b7280' }}>{selectedSubmission.worker} • {selectedSubmission.for_date}</Text>
                            </View>
                            <Pressable 
                                onPress={() => setShowApprovalTable(false)}
                                style={{ padding: 8, backgroundColor: '#ef4444', borderRadius: 6 }}
                            >
                                <Text style={{ color: 'white' }}>Close</Text>
                            </Pressable>
                        </View>
                        
                        <ScrollView horizontal style={{ flex: 1 }}>
                            <View>
                                <GridHeader columns={[
                                    { key: 'sku_name', title: 'SKU Name', width: 100 },
                                    { key: 'mrp', title: 'MRP', width: 60, align: 'right' as const },
                                    { key: 'aw_rate', title: 'AW Rate', width: 70, align: 'right' as const },
                                    { key: 'retail_rate', title: 'Retail Rate', width: 80, align: 'right' as const },
                                    { key: 'db_rate', title: 'DB Rate', width: 70, align: 'right' as const },
                                    { key: 'shop_com', title: 'SHOP COM', width: 80, align: 'right' as const },
                                    { key: 'db_com', title: 'DB COM', width: 70, align: 'right' as const },
                                    { key: 'self', title: 'SELF', width: 60, align: 'right' as const },
                                    { key: 'sku', title: 'SKU', width: 60, align: 'right' as const },
                                    { key: 'mr', title: 'MR', width: 60, align: 'right' as const },
                                    { key: 'fr', title: 'FR', width: 60, align: 'right' as const },
                                    { key: 'sale', title: 'SALE', width: 60, align: 'right' as const },
                                    { key: 'mr_value', title: 'MR VALUE', width: 80, align: 'right' as const },
                                    { key: 'fr_value', title: 'FR VALUE', width: 80, align: 'right' as const },
                                    { key: 'sale_amount', title: 'SALE AMOUNT', width: 100, align: 'right' as const },
                                    { key: 'percentage', title: 'PERCENTAGE', width: 80, align: 'right' as const }
                                ]} />
                                {approvalData.map((row, idx) => (
                                    <GridRow 
                                        key={idx} 
                                        columns={[
                                            { key: 'sku_name', title: 'SKU Name', width: 100, editable: false },
                                            { key: 'mrp', title: 'MRP', width: 60, align: 'right' as const, editable: false },
                                            { key: 'aw_rate', title: 'AW Rate', width: 70, align: 'right' as const, editable: false },
                                            { key: 'retail_rate', title: 'Retail Rate', width: 80, align: 'right' as const, editable: false },
                                            { key: 'db_rate', title: 'DB Rate', width: 70, align: 'right' as const, editable: false },
                                            { key: 'shop_com', title: 'SHOP COM', width: 80, align: 'right' as const, editable: false },
                                            { key: 'db_com', title: 'DB COM', width: 70, align: 'right' as const, editable: false },
                                            { key: 'self', title: 'SELF', width: 60, align: 'right' as const, editable: false },
                                            { key: 'sku', title: 'SKU', width: 60, align: 'right' as const, editable: false },
                                            { key: 'mr', title: 'MR', width: 60, align: 'right' as const, editable: false },
                                            { key: 'fr', title: 'FR', width: 60, align: 'right' as const, editable: false },
                                            { key: 'sale', title: 'SALE', width: 60, align: 'right' as const, editable: false },
                                            { key: 'mr_value', title: 'MR VALUE', width: 80, align: 'right' as const, editable: false },
                                            { key: 'fr_value', title: 'FR VALUE', width: 80, align: 'right' as const, editable: false },
                                            { key: 'sale_amount', title: 'SALE AMOUNT', width: 100, align: 'right' as const, editable: false },
                                            { key: 'percentage', title: 'PERCENTAGE', width: 80, align: 'right' as const, editable: false }
                                        ]} 
                                        row={row} 
                                        onChange={() => {}} 
                                    />
                                ))}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
}

function ApprovalBlock({ submission }: { submission: any }) {
    const db = useSQLiteContext();
    const [rows, setRows] = useState<any[]>(() => DEFAULT_SKUS.map((name) => ({ name, sku: 0, mr: 0, fr: 0, delb_rate: 0, sale: 0, amount: 0, ordering: '' })));
    const [cash, setCash] = useState<number>(Number(submission.cash) || 0);
    const [online, setOnline] = useState<number>(Number(submission.online) || 0);
    const totalAmount = useMemo(() => rows.reduce((s, r) => s + (Number(r.amount) || 0), 0), [rows]);
    const totalDue = Number(submission.total_due) || (Number(submission.previous_balance) || 0) + totalAmount;
    const remaining = totalDue - cash - online;

    useEffect(() => {
        (async () => {
            const lines = await fetchSubmissionLines(db, submission.id);
            const map: Record<string, any> = {};
            for (const name of DEFAULT_SKUS) map[name] = { name, sku: 0, mr: 0, fr: 0, delb_rate: 0, sale: 0, amount: 0, ordering: '' };
            for (const l of lines) {
                map[l.name] = {
                    name: l.name,
                    sku: l.sku ?? 0,
                    mr: l.mr ?? 0,
                    fr: l.fr ?? 0,
                    delb_rate: l.delb_rate ?? 0,
                    sale: l.sale ?? 0,
                    amount: l.amount ?? 0,
                    ordering: l.ordering ?? '',
                };
            }
            setRows(Object.values(map));
        })();
    }, [db, submission?.id]);

    function updateRow(idx: number, key: string, text: string) {
        setRows((prev) => {
            const next = [...prev];
            const r: any = { ...next[idx] };
            if (['sku','mr','fr','delb_rate'].includes(key)) {
                r[key] = Number(text) || 0;
            } else {
                r[key] = text;
            }
            r.sale = (Number(r.sku)||0) - (Number(r.mr)||0);
            r.amount = r.sale * (Number(r.delb_rate)||0);
            next[idx] = r;
            return next;
        });
    }

    async function saveAll() {
        for (const r of rows) {
            await upsertSubmissionLineFull(db, submission.id, { name: r.name, sku: r.sku, mr: r.mr, fr: r.fr, delb_rate: r.delb_rate, sale: r.sale, amount: r.amount, ordering: r.ordering });
        }
        await updateSubmissionTotals(db, submission.id, { sku: rows.reduce((s, r) => s + (r.sku||0), 0), mr: rows.reduce((s, r) => s + (r.mr||0), 0), fr: rows.reduce((s, r) => s + (r.fr||0), 0), sale: rows.reduce((s, r) => s + (r.sale||0), 0), amount: totalAmount });
        await updateSubmissionPayments(db, submission.id, cash, online, remaining);
    }

    return (
        <View style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 12, overflow: 'hidden' }}>
            <View style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: '600' }}>{submission.worker} • {submission.for_date}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable onPress={async () => { await saveAll(); }} style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#0ea5e9', borderRadius: 8 }}><Text style={{ color: 'white' }}>Save</Text></Pressable>
                    <Pressable onPress={async () => { await saveAll(); await approveSubmission(db, submission.id); }} style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#10b981', borderRadius: 8 }}><Text style={{ color: 'white' }}>Approve</Text></Pressable>
                </View>
            </View>
            <ScrollView horizontal bounces={false}>
                <View style={{ minWidth: 1000 }}>
                    <GridHeader columns={[
                        { key: 'name', title: 'SKU', width: 80 },
                        { key: 'sku', title: 'SKU', width: 50, align: 'right' as const },
                        { key: 'mr', title: 'MR', width: 50, align: 'right' as const },
                        { key: 'fr', title: 'FR', width: 50, align: 'right' as const },
                        { key: 'delb_rate', title: 'RATE', width: 60, align: 'right' as const },
                        { key: 'sale', title: 'SALE', width: 50, align: 'right' as const },
                        { key: 'amount', title: 'AMT', width: 60, align: 'right' as const },
                        { key: 'ordering', title: 'ORD', width: 50, align: 'right' as const },
                    ]} />
                    <ScrollView style={{ maxHeight: 360 }}>
                        {rows.map((r, idx) => (
                            <GridRow key={r.name+idx} columns={[
                                { key: 'name', title: 'SKU', width: 80, editable: false },
                                { key: 'sku', title: 'SKU', width: 50, align: 'right' as const },
                                { key: 'mr', title: 'MR', width: 50, align: 'right' as const },
                                { key: 'fr', title: 'FR', width: 50, align: 'right' as const },
                                { key: 'delb_rate', title: 'RATE', width: 60, align: 'right' as const },
                                { key: 'sale', title: 'SALE', width: 50, align: 'right' as const },
                                { key: 'amount', title: 'AMT', width: 60, align: 'right' as const },
                                { key: 'ordering', title: 'ORD', width: 50, align: 'right' as const },
                            ]} row={r as any} onChange={(k, v) => updateRow(idx, k, v)} />
                        ))}
                    </ScrollView>
                </View>
            </ScrollView>
            <View style={{ padding: 12, borderTopWidth: 1, borderColor: '#eee' }}>
                <Text style={{ fontWeight: '600', marginBottom: 8 }}>Payments</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}><LabeledInput label="Today's Amount" value={String(totalAmount.toFixed(2))} editable={false} /></View>
                    <View style={{ flex: 1 }}><LabeledInput label="Cash" value={String(cash)} keyboardType="numeric" onChangeText={(t) => { const n = Number(t)||0; setCash(n); setOnline(Math.max(totalAmount - n, 0)); }} /></View>
                    <View style={{ flex: 1 }}><LabeledInput label="Online" value={String(online)} keyboardType="numeric" onChangeText={(t) => { const n = Number(t)||0; setOnline(n); setCash(Math.max(totalAmount - n, 0)); }} /></View>
                    <View style={{ flex: 1 }}><LabeledInput label="Remaining" value={String((totalDue - cash - online).toFixed(2))} editable={false} /></View>
                </View>
            </View>
        </View>
    );
}

export function PaymentsTab() {
    const db = useSQLiteContext();
    const [items, setItems] = useState<any[]>([]);
    const [date, setDate] = useState<Date | null>(null);
    const [showPicker, setShowPicker] = useState<boolean>(false);
    async function refresh(d: Date | null = date) {
        const rows = await fetchPendingSubmissions(db);
        if (d) {
            const day = d.toISOString().slice(0,10);
            const filtered = rows.filter(r => r.for_date === day);
            
            // Group by location and keep only the most recent submission for each location
            const locationMap = new Map();
            filtered.forEach(submission => {
                const location = submission.location || 'No Location';
                const existing = locationMap.get(location);
                if (!existing || new Date(submission.created_at || submission.id) > new Date(existing.created_at || existing.id)) {
                    locationMap.set(location, submission);
                }
            });
            
            const stackedItems = Array.from(locationMap.values());
            setItems(stackedItems);
        } else {
            // For "all dates", also stack by location
            const locationMap = new Map();
            rows.forEach(submission => {
                const location = submission.location || 'No Location';
                const existing = locationMap.get(location);
                if (!existing || new Date(submission.created_at || submission.id) > new Date(existing.created_at || existing.id)) {
                    locationMap.set(location, submission);
                }
            });
            
            const stackedItems = Array.from(locationMap.values());
            setItems(stackedItems);
        }
    }
    useEffect(() => { void refresh(null); }, []);
    useEffect(() => { void refresh(date); }, [date]);
    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            <View style={{ padding: 16, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '600' }}>Payments</Text>
                <Pressable onPress={() => setShowPicker(true)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999 }}>
                    <Text>{date ? date.toLocaleDateString() : 'All dates'}</Text>
                </Pressable>
                {showPicker ? (
                    <DateTimePicker value={date ?? new Date()} mode="date" onChange={(e: any, d?: Date) => { setShowPicker(false); if (d) setDate(d); }} />
                ) : null}
                <Pressable onPress={async () => { 
                    const { Alert } = await import('react-native');
                    Alert.alert('Clear pending?', 'This will permanently delete pending submissions for the selected date (or all dates if none selected).', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'OK', style: 'destructive', onPress: async () => { await clearPendingSubmissions(db, date ? date.toISOString().slice(0,10) : null); setItems([]); await refresh(date || null); } },
                    ]);
                }} style={{ paddingHorizontal: 12, paddingVertical: 8, marginLeft: 8 }}>
                    <Text>Clear</Text>
                </Pressable>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }}>
                {items.map((s) => (
                    <View key={s.id} style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, backgroundColor: '#fff' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <View>
                                <Text style={{ fontWeight: '600', fontSize: 16 }}>{s.worker}</Text>
                                <Text style={{ color: '#3b82f6', fontSize: 12, fontWeight: '500' }}>{s.location || 'No Location'}</Text>
                            </View>
                            <Text style={{ color: '#6b7280', fontSize: 12 }}>{s.for_date}</Text>
                        </View>
                        <Text>Total: {s.total_amount}</Text>
                        <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                            <View style={{ flex: 1 }}>
                                <LabeledInput label="Cash" value={String(s.cash)} keyboardType="numeric" onChangeText={(t) => {
                                    const n = Number(t) || 0; const online = Math.max((s.total_amount ?? 0) - n, 0); s.cash = n; s.online = online; s.remaining_due = (s.total_due ?? 0) - n - online; setItems([...items]);
                                }} style={{ height: 40, fontSize: 14 }} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <LabeledInput label="Online" value={String(s.online)} keyboardType="numeric" onChangeText={(t) => {
                                    const n = Number(t) || 0; const cash = Math.max((s.total_amount ?? 0) - n, 0); s.online = n; s.cash = cash; s.remaining_due = (s.total_due ?? 0) - cash - n; setItems([...items]);
                                }} style={{ height: 40, fontSize: 14 }} />
                            </View>
                        </View>
                        <Text style={{ marginTop: 6 }}>Remaining: {s.remaining_due ?? 0}</Text>
                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                            <Pressable onPress={async () => { await updateSubmissionPayments(db, s.id, Number(s.cash)||0, Number(s.online)||0, Number(s.remaining_due)||0); }} style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#0ea5e9', borderRadius: 8 }}>
                                <Text style={{ color: 'white' }}>Save</Text>
                            </Pressable>
                            <Pressable onPress={async () => { await approveSubmission(db, s.id); await refresh(); }} style={{ paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#10b981', borderRadius: 8 }}>
                                <Text style={{ color: 'white' }}>Approve</Text>
                            </Pressable>
                        </View>
                    </View>
                ))}
                {items.length === 0 ? <Text>No pending payments.</Text> : null}
            </ScrollView>
        </SafeAreaView>
    );
}

const Tab = createBottomTabNavigator();

export default function Admin() {
    const db = useSQLiteContext();
    const [pendingCount, setPendingCount] = useState<number>(0);
    async function refreshBadge() {
        const c = await fetchPendingCount(db);
        setPendingCount(c);
    }
    useEffect(() => { void refreshBadge(); }, []);
    useEffect(() => { (async () => { const today = new Date().toISOString().slice(0,10); await expireOldPending(db, today); })(); }, [db]);
    return (
        <NavigationContainer>
            <Tab.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: '#0ea5e9', tabBarStyle: { backgroundColor: '#fff' } }}>
                <Tab.Screen name="Main" component={AdminMain} />
                <Tab.Screen name="Approval Data" component={ApprovalsTab} options={{ tabBarBadge: pendingCount || undefined }} />
                <Tab.Screen name="Approval Payment" component={PaymentsTab} options={{ tabBarBadge: pendingCount || undefined }} />
                <Tab.Screen name="Orders" component={AdminOrders} />
                <Tab.Screen name="Rates & Sequence" component={RatesSequenceTab} />
                <Tab.Screen name="Total" component={TotalsTab} />
                <Tab.Screen name="Export" component={ExportTab} />
                <Tab.Screen name="Settings" component={SettingsTab} />
                <Tab.Screen name="Workers" component={WorkersTab} />
                <Tab.Screen name="Ranking" component={RankingTab} />
            </Tab.Navigator>
        </NavigationContainer>
    );
}

function RatesSequenceTab() {
    const db = useSQLiteContext();
    const [workers, setWorkers] = useState<Array<{ id: number; label: string }>>([]);
    const [selectedWorker, setSelectedWorker] = useState<number | null>(null);
    const [isApplyAll, setIsApplyAll] = useState<boolean>(false);
    const [rates, setRates] = useState<Record<string, number>>({});
    const [seq, setSeq] = useState<Array<{ name: string; seq: number }>>([]);
    const [mrpData, setMrpData] = useState<Record<number, Record<string, number>>>({});
    const [dbData, setDbData] = useState<Record<number, Record<string, number>>>({});
    const [awData, setAwData] = useState<Record<number, Record<string, number>>>({});
    const gridRefs = useRef<{[key: string]: any}>({});
    const mainScrollRef = useRef<ScrollView>(null);
    const extraScrollRef = useRef<ScrollView>(null);
    const isScrolling = useRef<boolean>(false);
    
    // Synchronized scrolling handlers
    const handleMainScroll = (event: any) => {
        if (isScrolling.current) return;
        const scrollX = event.nativeEvent.contentOffset.x;
        isScrolling.current = true;
        if (extraScrollRef.current) {
            extraScrollRef.current.scrollTo({ x: scrollX, animated: false });
        }
        setTimeout(() => { isScrolling.current = false; }, 50);
    };
    
    const handleExtraScroll = (event: any) => {
        if (isScrolling.current) return;
        const scrollX = event.nativeEvent.contentOffset.x;
        isScrolling.current = true;
        if (mainScrollRef.current) {
            mainScrollRef.current.scrollTo({ x: scrollX, animated: false });
        }
        setTimeout(() => { isScrolling.current = false; }, 50);
    };

    useEffect(() => {
        (async () => {
            const w = await getWorkers(db);
            setWorkers(w);
            if (w.length > 0) {
                setSelectedWorker(w[0]?.id ?? null);
                setIsApplyAll(false);
            }
            setSeq(await getSkuSequence(db));
        })();
    }, [db]);

    useEffect(() => {
        (async () => {
            if (isApplyAll) {
                // When "Apply All" is selected, clear the rates (admin will enter new rates to apply to all)
                setRates({});
                setDbData(prev => ({
                    ...prev,
                    [-1]: {} // Use -1 as a special key for "Apply All" mode
                }));
            } else if (selectedWorker != null) {
                const r = await getWorkerRates(db, selectedWorker);
                setRates(r);
                
                // Load existing DB rates
                const dbRates = await getWorkerDbRates(db, selectedWorker);
                setDbData(prev => ({
                    ...prev,
                    [selectedWorker]: dbRates
                }));
            }
        })();
    }, [db, selectedWorker, isApplyAll]);

    // Partition SKUs into main (up to M PIZZA 150) and extra products - same as main table
    const mPizzaIndex = DEFAULT_SKUS.findIndex((n) => n === 'M PIZZA 150');
    const mainSkuNames = mPizzaIndex >= 0 ? DEFAULT_SKUS.slice(0, mPizzaIndex + 1) : DEFAULT_SKUS;
    const extraSkuNames = mPizzaIndex >= 0 ? DEFAULT_SKUS.slice(mPizzaIndex + 1) : [];

    const orderedNames = useMemo(() => {
        const withSeq = seq
            .filter((s) => typeof s?.seq === 'number')
            .sort((a, b) => (a.seq || 0) - (b.seq || 0))
            .map((s) => s.name)
            .filter((name) => DEFAULT_SKUS.includes(name)); // Only include SKUs that are in DEFAULT_SKUS
        const missing = DEFAULT_SKUS.filter((n) => !withSeq.includes(n));
        return [...withSeq, ...missing];
    }, [seq]);

    // Split into main and extra SKUs
    const mainOrderedNames = orderedNames.filter(name => mainSkuNames.includes(name));
    const extraOrderedNames = orderedNames.filter(name => extraSkuNames.includes(name));

    async function saveAll() {
        try {
            if (isApplyAll) {
                // Apply rates to all workers (overwrite existing rates when in Apply All mode)
                const workerIds = workers.map(w => w.id);
                const applyAllDbData = dbData[-1] || {};
                
                console.log('[Apply All] Rates to apply:', rates);
                console.log('[Apply All] DB Rates to apply:', applyAllDbData);
                
                for (const name of DEFAULT_SKUS) {
                    // Apply retail rate if it exists in the rates object (even if 0)
                    if (name in rates) {
                        const rate = rates[name] ?? 0;
                        console.log(`[Apply All] Applying retail rate for ${name}: ${rate} to ${workerIds.length} workers`);
                        await applyRateToAllWorkers(db, workerIds, name, rate, false); // false = overwrite existing
                    }
                    
                    // Apply DB rate if it exists in the applyAllDbData object (even if 0)
                    if (name in applyAllDbData) {
                        const dbRate = applyAllDbData[name] ?? 0;
                        console.log(`[Apply All] Applying DB rate for ${name}: ${dbRate} to ${workerIds.length} workers`);
                        await applyDbRateToAllWorkers(db, workerIds, name, dbRate, false); // false = overwrite existing
                    }
                }
            } else if (selectedWorker != null) {
                for (const name of DEFAULT_SKUS) {
                    const rate = rates[name] ?? 0;
                    await setWorkerRate(db, selectedWorker, name, rate);
                    
                    // Save DB rate to database
                    const dbRate = dbData[selectedWorker]?.[name] ?? 0;
                    await setWorkerDbRate(db, selectedWorker, name, dbRate);
                }
            }
            // Persist sequence for every SKU in the current ordered list
            let i = 1;
            for (const name of orderedNames) {
                const s = seq.find((x) => x.name === name);
                const seqNum = s?.seq ?? i;
                await setSkuSequence(db, name, seqNum);
                i += 1;
            }
            // Refresh from DB so UI reflects the new order
            setSeq(await getSkuSequence(db));
            
            // Show success message
            const { Alert } = require('react-native');
            Alert.alert('Success', isApplyAll ? 'Rates applied to all workers successfully!' : 'Rates and sequence saved successfully!');
        } catch (error) {
            console.error('Error saving rates:', error);
            const { Alert } = require('react-native');
            Alert.alert('Error', 'Failed to save rates. Please try again.');
        }
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            <View style={{ padding: 44, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '600' }}>Rates & Sequence</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable 
                        onPress={() => {
                            console.log('Save button pressed');
                            saveAll();
                        }} 
                        style={{ 
                            paddingHorizontal: 16, 
                            paddingVertical: 12, 
                            backgroundColor: '#0ea5e9', 
                            borderRadius: 8,
                            minWidth: 80,
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <Text style={{ color: 'white', fontWeight: '600' }}>Save</Text>
                    </Pressable>
                </View>
            </View>
            <KeyboardAvoidingView 
                style={{ flex: 1 }} 
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
            >
                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12, gap: 16 }}>
                    <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 }}>
                        <Text style={{ fontWeight: '600', marginBottom: 8 }}>Select Worker</Text>
                        <ScrollView horizontal contentContainerStyle={{ gap: 8 }}>
                            <Pressable 
                                onPress={() => {
                                    setIsApplyAll(true);
                                    setSelectedWorker(null);
                                }} 
                                style={{ 
                                    paddingHorizontal: 12, 
                                    paddingVertical: 8, 
                                    borderRadius: 999, 
                                    borderWidth: 1, 
                                    borderColor: isApplyAll ? '#10b981' : '#cbd5e1', 
                                    backgroundColor: isApplyAll ? '#d1fae5' : '#fff' 
                                }}
                            >
                                <Text style={{ color: isApplyAll ? '#065f46' : '#0f172a', fontWeight: isApplyAll ? '700' : '400' }}>Apply All</Text>
                            </Pressable>
                            {workers.map((w) => (
                                <Pressable 
                                    key={w.id} 
                                    onPress={() => {
                                        setSelectedWorker(w.id);
                                        setIsApplyAll(false);
                                    }} 
                                    style={{ 
                                        paddingHorizontal: 12, 
                                        paddingVertical: 8, 
                                        borderRadius: 999, 
                                        borderWidth: 1, 
                                        borderColor: selectedWorker===w.id && !isApplyAll ? '#0ea5e9' : '#cbd5e1', 
                                        backgroundColor: selectedWorker===w.id && !isApplyAll ? '#e0f2fe' : '#fff' 
                                    }}
                                >
                                    <Text style={{ color: '#0f172a' }}>{w.label}</Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>

                    <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
                        {/* Pricing Analysis Table - Main Products */}
                        <ScrollView 
                            ref={mainScrollRef}
                            horizontal 
                            bounces={false} 
                            style={{ flex: 1 }} 
                            contentContainerStyle={{ paddingBottom: 12 }}
                            onScroll={handleMainScroll}
                            scrollEventThrottle={16}
                        >
                            <View style={styles.sheetContainer}>
                                <View style={{ backgroundColor: '#f0f9ff', padding: 8 }}>
                                    <Text style={{ fontWeight: 'bold', color: '#0369a1', marginBottom: 8 }}>
                                        Main Products - {isApplyAll ? 'Apply All Workers' : (workers.find(w => w.id === selectedWorker)?.label || 'Select Worker')}
                                    </Text>
                                </View>
                                <GridHeader columns={[
                                    { key: 'sr', title: 'SR NO', width: 50, align: 'right' as const },
                                    { key: 'sku', title: 'SKU', width: 120 },
                                    { key: 'mrp', title: 'MRP', width: 60, align: 'right' as const },
                                    { key: 'retail', title: 'RETAIL RATE', width: 80, align: 'right' as const },
                                    { key: 'db', title: 'DB RATE', width: 70, align: 'right' as const },
                                    { key: 'aw', title: 'AW RATE', width: 70, align: 'right' as const },
                                    { key: 'diff1', title: 'SHOP COM', width: 70, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                    { key: 'diff2', title: 'DB COM', width: 70, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                    { key: 'diff3', title: 'SELF', width: 70, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' }
                                ]} />
                                <View style={{ flex: 1 }}>
                                    <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                                        {mainOrderedNames.map((skuName, idx) => {
                                            const mrp = (selectedWorker && mrpData[selectedWorker]) ? mrpData[selectedWorker][skuName] || 0 : 0;
                                            const retail = rates[skuName] || 0;
                                            const db = isApplyAll 
                                                ? (dbData[-1]?.[skuName] || 0)
                                                : ((selectedWorker && dbData[selectedWorker]) ? dbData[selectedWorker][skuName] || 0 : 0);
                                            const aw = (selectedWorker && awData[selectedWorker]) ? awData[selectedWorker][skuName] || 0 : 0;
                                            const diff1 = Number((mrp - retail).toFixed(2));
                                            const diff2 = Number((retail - db).toFixed(2));
                                            const diff3 = Number((db - aw).toFixed(2));
                                            
                                            return (
                                                <GridRow 
                                                    key={skuName + idx}
                                                    columns={[
                                                        { key: 'sr', title: 'SR NO', width: 50, align: 'right' as const, editable: false },
                                                        { key: 'sku', title: 'SKU', width: 120, editable: false },
                                                        { key: 'mrp', title: 'MRP', width: 60, align: 'right' as const },
                                                        { key: 'retail', title: 'RETAIL RATE', width: 80, align: 'right' as const },
                                                        { key: 'db', title: 'DB RATE', width: 70, align: 'right' as const },
                                                        { key: 'aw', title: 'AW RATE', width: 70, align: 'right' as const },
                                                        { key: 'diff1', title: 'DIFF1', width: 70, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                                        { key: 'diff2', title: 'DIFF2', width: 70, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                                        { key: 'diff3', title: 'DIFF3', width: 70, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' }
                                                    ]}
                                                    row={{
                                                        sr: idx + 1,
                                                        sku: skuName,
                                                        mrp: mrp,
                                                        retail: retail,
                                                        db: db,
                                                        aw: aw,
                                                        diff1: diff1,
                                                        diff2: diff2,
                                                        diff3: diff3
                                                    } as any}
                                                    onChange={(k, v) => {
                                                        // Handle rate changes for retail rate (works for both Apply All and individual worker)
                                                        if (k === 'retail') {
                                                            const numValue = v === '' ? 0 : (Number(v) || 0);
                                                            setRates((r) => ({ ...r, [skuName]: numValue }));
                                                        }
                                                        // Handle MRP changes - worker specific
                                                        if (k === 'mrp' && selectedWorker) {
                                                            setMrpData((m) => ({
                                                                ...m,
                                                                [selectedWorker]: {
                                                                    ...m[selectedWorker],
                                                                    [skuName]: Number(v) || 0
                                                                }
                                                            }));
                                                        }
                                                        // Handle DB RATE changes - worker specific or Apply All
                                                        if (k === 'db') {
                                                            if (isApplyAll) {
                                                                setDbData((d) => ({
                                                                    ...d,
                                                                    [-1]: {
                                                                        ...d[-1],
                                                                        [skuName]: Number(v) || 0
                                                                    }
                                                                }));
                                                            } else if (selectedWorker) {
                                                                setDbData((d) => ({
                                                                    ...d,
                                                                    [selectedWorker]: {
                                                                        ...d[selectedWorker],
                                                                        [skuName]: Number(v) || 0
                                                                    }
                                                                }));
                                                            }
                                                        }
                                                        // Handle AW RATE changes - worker specific
                                                        if (k === 'aw' && selectedWorker) {
                                                            setAwData((a) => ({
                                                                ...a,
                                                                [selectedWorker]: {
                                                                    ...a[selectedWorker],
                                                                    [skuName]: Number(v) || 0
                                                                }
                                                            }));
                                                        }
                                                    }}
                                                    onEnterPress={(columnIndex) => {
                                                        // Excel-like navigation: move to next row when Enter is pressed
                                                        const nextIdx = idx + 1;
                                                        if (nextIdx < mainOrderedNames.length) {
                                                            // Focus the same column in the next row
                                                            const nextRowKey = `${nextIdx}-${columnIndex}`;
                                                            setTimeout(() => {
                                                                if (gridRefs.current[nextRowKey]) {
                                                                    gridRefs.current[nextRowKey].focus();
                                                                }
                                                            }, 100);
                                                        }
                                                    }}
                                                />
                                            );
                                        })}
                                    </ScrollView>
                                </View>
                            </View>
                        </ScrollView>
                        
                        {/* Pricing Analysis Table - Extra Products */}
                        {extraOrderedNames.length > 0 && (
                            <ScrollView 
                                ref={extraScrollRef}
                                horizontal 
                                bounces={false} 
                                style={{ flex: 1 }} 
                                contentContainerStyle={{ paddingBottom: 12 }}
                                onScroll={handleExtraScroll}
                                scrollEventThrottle={16}
                            >
                                <View style={styles.sheetContainer}>
                                    <View style={{ backgroundColor: '#fef3c7', padding: 8 }}>
                                        <Text style={{ fontWeight: 'bold', color: '#92400e' }}>
                                            Extra Products - {isApplyAll ? 'Apply All Workers' : (workers.find(w => w.id === selectedWorker)?.label || 'Select Worker')}
                                        </Text>
                                    </View>
                                    <GridHeader columns={[
                                        { key: 'sr', title: 'SR NO', width: 50, align: 'right' as const },
                                        { key: 'sku', title: 'SKU', width: 120 },
                                        { key: 'mrp', title: 'MRP', width: 60, align: 'right' as const },
                                        { key: 'retail', title: 'RETAIL RATE', width: 80, align: 'right' as const },
                                        { key: 'db', title: 'DB RATE', width: 70, align: 'right' as const },
                                        { key: 'aw', title: 'AW RATE', width: 70, align: 'right' as const },
                                        { key: 'diff1', title: 'SHOP COM', width: 70, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                        { key: 'diff2', title: 'DB COM', width: 70, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                        { key: 'diff3', title: 'SELF', width: 70, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' }
                                    ]} />
                                    <View style={{ flex: 1 }}>
                                        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
                                            {extraOrderedNames.map((skuName, idx) => {
                                                const mrp = (selectedWorker && mrpData[selectedWorker]) ? mrpData[selectedWorker][skuName] || 0 : 0;
                                                const retail = rates[skuName] || 0;
                                                const db = isApplyAll 
                                                    ? (dbData[-1]?.[skuName] || 0)
                                                    : ((selectedWorker && dbData[selectedWorker]) ? dbData[selectedWorker][skuName] || 0 : 0);
                                                const aw = (selectedWorker && awData[selectedWorker]) ? awData[selectedWorker][skuName] || 0 : 0;
                                                const diff1 = Number((mrp - retail).toFixed(2));
                                                const diff2 = Number((retail - db).toFixed(2));
                                                const diff3 = Number((db - aw).toFixed(2));
                                                
                                                return (
                                                    <GridRow 
                                                        key={skuName + idx}
                                                        columns={[
                                                            { key: 'sr', title: 'SR NO', width: 50, align: 'right' as const, editable: false },
                                                            { key: 'sku', title: 'SKU', width: 120, editable: false },
                                                            { key: 'mrp', title: 'MRP', width: 60, align: 'right' as const },
                                                            { key: 'retail', title: 'RETAIL RATE', width: 80, align: 'right' as const },
                                                            { key: 'db', title: 'DB RATE', width: 70, align: 'right' as const },
                                                            { key: 'aw', title: 'AW RATE', width: 70, align: 'right' as const },
                                                            { key: 'diff1', title: 'DIFF1', width: 70, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                                            { key: 'diff2', title: 'DIFF2', width: 70, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                                            { key: 'diff3', title: 'DIFF3', width: 70, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' }
                                                        ]}
                                                        row={{
                                                            sr: idx + 1,
                                                            sku: skuName,
                                                            mrp: mrp,
                                                            retail: retail,
                                                            db: db,
                                                            aw: aw,
                                                            diff1: diff1,
                                                            diff2: diff2,
                                                            diff3: diff3
                                                        } as any}
                                                        onChange={(k, v) => {
                                                            // Handle rate changes for retail rate (works for both Apply All and individual worker)
                                                            if (k === 'retail') {
                                                                const numValue = v === '' ? 0 : (Number(v) || 0);
                                                                setRates((r) => ({ ...r, [skuName]: numValue }));
                                                            }
                                                            // Handle MRP changes - worker specific
                                                            if (k === 'mrp' && selectedWorker) {
                                                                setMrpData((m) => ({
                                                                    ...m,
                                                                    [selectedWorker]: {
                                                                        ...m[selectedWorker],
                                                                        [skuName]: Number(v) || 0
                                                                    }
                                                                }));
                                                            }
                                                            // Handle DB RATE changes - worker specific or Apply All
                                                            if (k === 'db') {
                                                                if (isApplyAll) {
                                                                    setDbData((d) => ({
                                                                        ...d,
                                                                        [-1]: {
                                                                            ...d[-1],
                                                                            [skuName]: Number(v) || 0
                                                                        }
                                                                    }));
                                                                } else if (selectedWorker) {
                                                                    setDbData((d) => ({
                                                                        ...d,
                                                                        [selectedWorker]: {
                                                                            ...d[selectedWorker],
                                                                            [skuName]: Number(v) || 0
                                                                        }
                                                                    }));
                                                                }
                                                            }
                                                            // Handle AW RATE changes - worker specific
                                                            if (k === 'aw' && selectedWorker) {
                                                                setAwData((a) => ({
                                                                    ...a,
                                                                    [selectedWorker]: {
                                                                        ...a[selectedWorker],
                                                                        [skuName]: Number(v) || 0
                                                                    }
                                                                }));
                                                            }
                                                        }}
                                                        onEnterPress={(columnIndex) => {
                                                            // Excel-like navigation: move to next row when Enter is pressed
                                                            const nextIdx = idx + 1;
                                                            if (nextIdx < extraOrderedNames.length) {
                                                                // Focus the same column in the next row
                                                                const nextRowKey = `${nextIdx}-${columnIndex}`;
                                                                setTimeout(() => {
                                                                    if (gridRefs.current[nextRowKey]) {
                                                                        gridRefs.current[nextRowKey].focus();
                                                                    }
                                                                }, 100);
                                                            }
                                                        }}
                                                    />
                                                );
                                            })}
                                        </ScrollView>
                                    </View>
                                </View>
                            </ScrollView>
                        )}

                    </View>

                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

export function ExportTab() {
    const db = useSQLiteContext();
    async function exportRange(days: number) {
        const now = new Date();
        const end = now.toISOString().slice(0,10);
        const startDate = new Date(now.getTime());
        startDate.setDate(now.getDate() - (days - 1));
        const start = startDate.toISOString().slice(0,10);
        const submissions = await fetchSubmissionsInRange(db, start, end);

        // Build sheets
        const sheetSub = [['id','for_date','worker','status','total_sku','total_mr','total_fr','total_sale','total_amount','cash','online','previous_balance','total_due','remaining_due']];
        const sheetLines = [['submission_id','name','sku','mr','fr','delb_rate','sale','amount','ordering']];
        for (const s of submissions) {
            sheetSub.push([s.id, s.for_date, s.worker, s.status, String(s.total_sku||0), String(s.total_mr||0), String(s.total_fr||0), String(s.total_sale||0), String(s.total_amount||0), String(s.cash||0), String(s.online||0), String(s.previous_balance||0), String(s.total_due||0), String(s.remaining_due||0)]);
            const lines = await fetchLinesForSubmission(db, s.id);
            for (const l of lines) {
                sheetLines.push([s.id, l.name, String(l.sku||0), String(l.mr||0), String(l.fr||0), String(l.delb_rate||0), String(l.sale||0), String(l.amount||0), l.ordering||'']);
            }
        }
        const totals = await fetchApprovedTotalsBySku(db, null);
        const sheetTotals = [['name','t_sku','t_mr','t_fr','t_sale','amount']];
        totals.forEach(t => sheetTotals.push([t.name, String(t.t_sku), String(t.t_mr), String(t.t_fr), String(t.t_sale), String(t.amount)]));
        const sheetSummary = [['range_start', start], ['range_end', end], ['num_submissions', submissions.length]];

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetSub), 'Submissions');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetLines), 'Lines');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetTotals), 'Totals');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sheetSummary), 'Summary');
        const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
        const filename = `export_${start}_to_${end}.xlsx`;
        try {
            if (Platform.OS === 'android' && FileSystem.StorageAccessFramework) {
                const perm = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
                if (perm.granted) {
                    const dirUri = perm.directoryUri;
                    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(dirUri, filename, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
                    await FileSystem.writeAsStringAsync(fileUri, wbout, { encoding: FileSystem.EncodingType.Base64 as any });
                    Alert.alert('Saved', `Excel saved to selected folder as ${filename}`);
                    return;
                }
            }
            // Fallback: save to app documents and open share sheet
            const fileUri = (FileSystem.documentDirectory || FileSystem.cacheDirectory) + filename;
            await FileSystem.writeAsStringAsync(fileUri, wbout, { encoding: FileSystem.EncodingType.Base64 as any });
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(fileUri);
            } else {
                Alert.alert('Saved', `CSV saved at ${fileUri}`);
            }
        } catch (e: any) {
            Alert.alert('Export failed', String(e?.message || e));
        }
    }
    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 12 }}>Export CSV</Text>
            <View style={{ gap: 12 }}>
                <Pressable onPress={() => exportRange(1)} style={{ padding: 12, backgroundColor: '#0ea5e9', borderRadius: 8 }}><Text style={{ color: 'white', textAlign: 'center' }}>Download Today</Text></Pressable>
                <Pressable onPress={() => exportRange(7)} style={{ padding: 12, backgroundColor: '#10b981', borderRadius: 8 }}><Text style={{ color: 'white', textAlign: 'center' }}>Download Last 7 Days</Text></Pressable>
                <Pressable onPress={() => exportRange(30)} style={{ padding: 12, backgroundColor: '#f59e0b', borderRadius: 8 }}><Text style={{ color: '#111827', textAlign: 'center' }}>Download Last 30 Days</Text></Pressable>
            </View>
        </SafeAreaView>
    );
}

export function TotalsTab() {
    const db = useSQLiteContext();
    const [date, setDate] = useState<Date | null>(null);
    const [showPicker, setShowPicker] = useState<boolean>(false);
    const [rows, setRows] = useState<any[]>([]);
    const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
    const mainScrollRef = useRef<ScrollView>(null);
    const extraScrollRef = useRef<ScrollView>(null);
    const isScrolling = useRef<boolean>(false);
    
    // Synchronized scrolling handlers
    const handleMainScroll = (event: any) => {
        if (isScrolling.current) return;
        const scrollX = event.nativeEvent.contentOffset.x;
        isScrolling.current = true;
        if (extraScrollRef.current) {
            extraScrollRef.current.scrollTo({ x: scrollX, animated: false });
        }
        setTimeout(() => { isScrolling.current = false; }, 50);
    };
    
    const handleExtraScroll = (event: any) => {
        if (isScrolling.current) return;
        const scrollX = event.nativeEvent.contentOffset.x;
        isScrolling.current = true;
        if (mainScrollRef.current) {
            mainScrollRef.current.scrollTo({ x: scrollX, animated: false });
        }
        setTimeout(() => { isScrolling.current = false; }, 50);
    };
    
    const handleRowSelect = (rowIndex: number) => {
        setSelectedRowIndex(selectedRowIndex === rowIndex ? null : rowIndex);
    };
    
    async function refresh(d: Date | null = date) {
        const day = d ? d.toISOString().slice(0,10) : null;
        const totals = await fetchApprovedTotalsBySku(db, day);
        // order by global seq if available
        const seq = await getSkuSequence(db);
        const order = seq?.map((s:any)=>s.name) ?? DEFAULT_SKUS;
        const map: Record<string, any> = {}; totals.forEach(t => map[t.name]=t);
        setRows(order.map((n) => ({ name: n, ...(map[n] ?? { t_sku:0, t_mr:0, t_fr:0, t_sale:0, amount:0 }) })));
    }
    useEffect(() => { void refresh(null); }, []);
    useEffect(() => { void refresh(date); }, [date]);
    
    // Split rows into main and extra sections
    const mPizzaIndex = DEFAULT_SKUS.findIndex(name => name === 'M PIZZA 150');
    const mainSkuNames = mPizzaIndex >= 0 ? DEFAULT_SKUS.slice(0, mPizzaIndex + 1) : DEFAULT_SKUS;
    const extraSkuNames = mPizzaIndex >= 0 ? DEFAULT_SKUS.slice(mPizzaIndex + 1) : [];
    const mainRows = rows.filter((r) => mainSkuNames.includes(r.name));
    const extraRows = rows.filter((r) => extraSkuNames.includes(r.name));
    
    const totalAmount = rows.reduce((s,r)=> s+(Number(r.amount)||0), 0);
    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            <View style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '600' }}>Total (Approved)</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Pressable onPress={() => setShowPicker(true)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999 }}>
                        <Text>{date ? date.toLocaleDateString() : 'All dates'}</Text>
                    </Pressable>
                    {showPicker ? (
                        <DateTimePicker value={date ?? new Date()} mode="date" onChange={(e: any, d?: Date) => { setShowPicker(false); if (d) setDate(d); }} />
                    ) : null}
                    <Pressable onPress={() => { setDate(null); void refresh(null); }} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
                        <Text>Clear</Text>
                    </Pressable>
                </View>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 12 }}>
                {/* Main Products Section */}
                <ScrollView 
                    ref={mainScrollRef}
                    horizontal 
                    bounces={false} 
                    style={{ flex: 1 }} 
                    contentContainerStyle={{ paddingBottom: 12 }}
                    onScroll={handleMainScroll}
                    scrollEventThrottle={16}
                >
                    <View style={styles.sheetContainer}>
                        <GridHeader columns={[
                            { key: 'name', title: 'SKU', width: 100 }, 
                            { key: 't_sku', title: 'T.SKU', width: 60, align: 'right' as const }, 
                            { key: 't_mr', title: 'T.MR', width: 60, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' }, 
                            { key: 't_fr', title: 'T.FR', width: 60, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' }, 
                            { key: 't_sale', title: 'T.SALE', width: 70, align: 'right' as const, color: '#059669', fontWeight: 'bold' as const, backgroundColor: '#f0fdf4' }, 
                            { key: 't_mr_value', title: 'T.MR VALUE', width: 80, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                            { key: 't_fr_value', title: 'T.FR VALUE', width: 80, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                            { key: 't_amount', title: 'T.AMT', width: 80, align: 'right' as const, color: '#059669', fontWeight: 'bold' as const, backgroundColor: '#f0fdf4' },
                            { key: 't_db_comm', title: 'T.DB COMM', width: 80, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                            { key: 'percentage', title: '%', width: 70, align: 'right' as const, color: '#059669', fontWeight: 'bold' as const, backgroundColor: '#f0fdf4' },
                            { key: 'remark', title: 'REMARK', width: 80, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' }
                        ]} />
                        <View style={{ flex: 1 }}>
                            <ScrollView style={{ flex: 1 }}>
                                {mainRows.map((r, idx) => {
                                    // Calculate all values
                                    const tSku = Number(r.t_sku) || 0;
                                    const tMr = Number(r.t_mr) || 0;
                                    const tFr = Number(r.t_fr) || 0;
                                    const tSale = Number(r.t_sale) || 0;
                                    const delbRate = Number(r.delb_rate) || 0;
                                    
                                    // Calculate T.MR VALUE = T.MR * DEL.B RATE
                                    const tMrValue = tMr * delbRate;
                                    
                                    // Calculate T.FR VALUE = T.FR * DEL.B RATE
                                    const tFrValue = tFr * delbRate;
                                    
                                    // Calculate T.AMT = T.MR VALUE + T.FR VALUE
                                    const tAmount = tMrValue + tFrValue;
                                    
                                    // Calculate T.SALE VALUE = T.SALE * DEL.B RATE
                                    const tSaleValue = tSale * delbRate;
                                    
                                    // Calculate percentage = (T.MR * 100) / T.SKU
                                    const percentage = tSku > 0 ? (tMr * 100) / tSku : 0;
                                    
                                    // Calculate D.B Commission (sum of all D.B commission for this SKU)
                                    const tDbComm = Number(r.db_comm) || 0;
                                    
                                    // Calculate remark: T.SKU - (T.MR + T.FR)
                                    const remark = tSku - (tMr + tFr);
                                    
                                    return (
                                        <GridRow 
                                            key={r.name+idx} 
                                            columns={[
                                                { key: 'name', title: 'SKU', width: 100, editable: false }, 
                                                { key: 't_sku', title: 'T.SKU', width: 60, align: 'right' as const, editable: false }, 
                                                { key: 't_mr', title: 'T.MR', width: 60, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' }, 
                                                { key: 't_fr', title: 'T.FR', width: 60, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' }, 
                                                { key: 't_sale', title: 'T.SALE', width: 70, align: 'right' as const, editable: false, color: '#059669', fontWeight: 'bold' as const, backgroundColor: '#f0fdf4' }, 
                                                { key: 't_mr_value', title: 'T.MR VALUE', width: 80, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                                { key: 't_fr_value', title: 'T.FR VALUE', width: 80, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                                { key: 't_amount', title: 'T.AMT', width: 80, align: 'right' as const, editable: false, color: '#059669', fontWeight: 'bold' as const, backgroundColor: '#f0fdf4' },
                                                { key: 't_db_comm', title: 'T.DB COMM', width: 80, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                                { key: 'percentage', title: '%', width: 70, align: 'right' as const, editable: false, color: '#059669', fontWeight: 'bold' as const, backgroundColor: '#f0fdf4' },
                                                { key: 'remark', title: 'REMARK', width: 80, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' }
                                            ]} 
                                            row={{...r, t_sale: tSku - (tMr + tFr), t_mr_value: tMrValue, t_fr_value: tFrValue, t_amount: tAmount, t_db_comm: tDbComm, percentage, remark}} 
                                            onChange={()=>{}} 
                                            onRowPress={() => handleRowSelect(idx)}
                                            isSelected={selectedRowIndex === idx}
                                        />
                                    );
                                })}
                    </ScrollView>
                        </View>
                        <View style={styles.footerRow}>
                            <Text style={[styles.footerCell, { width: 100, fontWeight: '600' }]}>Totals</Text>
                            <Text style={[styles.footerCell, { width: 60, textAlign: 'right', fontWeight: '600' }]}>{mainRows.reduce((s,r)=> s+(Number(r.t_sku)||0), 0)}</Text>
                            <Text style={[styles.footerCell, { width: 60, textAlign: 'right', fontWeight: '600', color: '#dc2626' }]}>{mainRows.reduce((s,r)=> s+(Number(r.t_mr)||0), 0)}</Text>
                            <Text style={[styles.footerCell, { width: 60, textAlign: 'right', fontWeight: '600', color: '#dc2626' }]}>{mainRows.reduce((s,r)=> s+(Number(r.t_fr)||0), 0)}</Text>
                            <Text style={[styles.footerCell, { width: 70, textAlign: 'right', fontWeight: '600', color: '#059669' }]}>
                                {mainRows.reduce((s,r)=> {
                                    const tSku = Number(r.t_sku) || 0;
                                    const tMr = Number(r.t_mr) || 0;
                                    const tFr = Number(r.t_fr) || 0;
                                    return s + (tSku - (tMr + tFr));
                                }, 0)}
                            </Text>
                            <Text style={[styles.footerCell, { width: 80, textAlign: 'right', fontWeight: '600', color: '#dc2626' }]}>
                                {mainRows.reduce((s,r)=> {
                                    const tMr = Number(r.t_mr) || 0;
                                    const delbRate = Number(r.delb_rate) || 0;
                                    return s + (tMr * delbRate);
                                }, 0).toFixed(2)}
                            </Text>
                            <Text style={[styles.footerCell, { width: 80, textAlign: 'right', fontWeight: '600', color: '#dc2626' }]}>
                                {mainRows.reduce((s,r)=> {
                                    const tFr = Number(r.t_fr) || 0;
                                    const delbRate = Number(r.delb_rate) || 0;
                                    return s + (tFr * delbRate);
                                }, 0).toFixed(2)}
                            </Text>
                            <Text style={[styles.footerCell, { width: 80, textAlign: 'right', fontWeight: '600', color: '#059669' }]}>
                                {mainRows.reduce((s,r)=> {
                                    const tMr = Number(r.t_mr) || 0;
                                    const tFr = Number(r.t_fr) || 0;
                                    const delbRate = Number(r.delb_rate) || 0;
                                    return s + ((tMr + tFr) * delbRate);
                                }, 0).toFixed(2)}
                            </Text>
                            <Text style={[styles.footerCell, { width: 80, textAlign: 'right', fontWeight: '600', color: '#dc2626' }]}>{mainRows.reduce((s,r)=> s+(Number(r.db_comm)||0), 0)}</Text>
                            <Text style={[styles.footerCell, { width: 70, textAlign: 'right', fontWeight: '600', color: '#059669' }]}>
                                {(() => {
                                    const totalTMr = mainRows.reduce((s,r)=> s+(Number(r.t_mr)||0), 0);
                                    const totalTSku = mainRows.reduce((s,r)=> s+(Number(r.t_sku)||0), 0);
                                    return totalTSku > 0 ? ((totalTMr * 100) / totalTSku).toFixed(1) : '0.0';
                                })()}%
                            </Text>
                            <Text style={[styles.footerCell, { width: 80, textAlign: 'right', fontWeight: '600', color: '#dc2626' }]}>
                                {mainRows.reduce((s,r)=> {
                                    const tSku = Number(r.t_sku) || 0;
                                    const tMr = Number(r.t_mr) || 0;
                                    const tFr = Number(r.t_fr) || 0;
                                    return s + (tSku - (tMr + tFr));
                                }, 0)}
                            </Text>
                    </View>
                </View>
                </ScrollView>

                {/* Extra Products Section */}
                {extraRows.length > 0 && (
                    <View style={{ marginTop: 12 }}>
                        <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8, paddingHorizontal: 4 }}>Extra Products</Text>
                        <ScrollView 
                            ref={extraScrollRef}
                            horizontal 
                            bounces={false} 
                            style={{ flex: 1 }} 
                            contentContainerStyle={{ paddingBottom: 12 }}
                            onScroll={handleExtraScroll}
                            scrollEventThrottle={16}
                        >
                            <View style={styles.sheetContainer}>
                                <GridHeader columns={[
                                    { key: 'name', title: 'SKU', width: 100 }, 
                                    { key: 't_sku', title: 'T.SKU', width: 60, align: 'right' as const }, 
                                    { key: 't_mr', title: 'T.MR', width: 60, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' }, 
                                    { key: 't_fr', title: 'T.FR', width: 60, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' }, 
                                    { key: 't_sale', title: 'T.SALE', width: 70, align: 'right' as const, color: '#059669', fontWeight: 'bold' as const, backgroundColor: '#f0fdf4' }, 
                                    { key: 't_mr_value', title: 'T.MR VALUE', width: 80, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                    { key: 't_fr_value', title: 'T.FR VALUE', width: 80, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                    { key: 't_amount', title: 'T.AMT', width: 80, align: 'right' as const, color: '#059669', fontWeight: 'bold' as const, backgroundColor: '#f0fdf4' },
                                    { key: 't_db_comm', title: 'T.DB COMM', width: 80, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                    { key: 'percentage', title: '%', width: 70, align: 'right' as const, color: '#059669', fontWeight: 'bold' as const, backgroundColor: '#f0fdf4' },
                                    { key: 'remark', title: 'REMARK', width: 80, align: 'right' as const, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' }
                                ]} />
                                <View style={{ flex: 1 }}>
                                    <ScrollView style={{ flex: 1 }}>
                                        {extraRows.map((r, idx) => {
                                            // Calculate all values
                                            const tSku = Number(r.t_sku) || 0;
                                            const tMr = Number(r.t_mr) || 0;
                                            const tFr = Number(r.t_fr) || 0;
                                            const tSale = Number(r.t_sale) || 0;
                                            const delbRate = Number(r.delb_rate) || 0;
                                            
                                            // Calculate T.MR VALUE = T.MR * DEL.B RATE
                                            const tMrValue = tMr * delbRate;
                                            
                                            // Calculate T.FR VALUE = T.FR * DEL.B RATE
                                            const tFrValue = tFr * delbRate;
                                            
                                            // Calculate T.AMT = T.MR VALUE + T.FR VALUE
                                            const tAmount = tMrValue + tFrValue;
                                            
                                            // Calculate T.SALE VALUE = T.SALE * DEL.B RATE
                                            const tSaleValue = tSale * delbRate;
                                            
                                            // Calculate percentage = (T.MR * 100) / T.SKU
                                            const percentage = tSku > 0 ? (tMr * 100) / tSku : 0;
                                            
                                            // Calculate D.B Commission (sum of all D.B commission for this SKU)
                                            const tDbComm = Number(r.db_comm) || 0;
                                            
                                            // Calculate remark: T.SKU - (T.MR + T.FR)
                                            const remark = tSku - (tMr + tFr);
                                            
                                            return (
                                                <GridRow 
                                                    key={r.name+idx} 
                                                    columns={[
                                                        { key: 'name', title: 'SKU', width: 100, editable: false }, 
                                                        { key: 't_sku', title: 'T.SKU', width: 60, align: 'right' as const, editable: false }, 
                                                        { key: 't_mr', title: 'T.MR', width: 60, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' }, 
                                                        { key: 't_fr', title: 'T.FR', width: 60, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' }, 
                                                        { key: 't_sale', title: 'T.SALE', width: 70, align: 'right' as const, editable: false, color: '#059669', fontWeight: 'bold' as const, backgroundColor: '#f0fdf4' }, 
                                                        { key: 't_mr_value', title: 'T.MR VALUE', width: 80, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                                        { key: 't_fr_value', title: 'T.FR VALUE', width: 80, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                                        { key: 't_amount', title: 'T.AMT', width: 80, align: 'right' as const, editable: false, color: '#059669', fontWeight: 'bold' as const, backgroundColor: '#f0fdf4' },
                                                        { key: 't_db_comm', title: 'T.DB COMM', width: 80, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' },
                                                        { key: 'percentage', title: '%', width: 70, align: 'right' as const, editable: false, color: '#059669', fontWeight: 'bold' as const, backgroundColor: '#f0fdf4' },
                                                        { key: 'remark', title: 'REMARK', width: 80, align: 'right' as const, editable: false, color: '#dc2626', fontWeight: 'bold' as const, backgroundColor: '#fef2f2' }
                                                    ]} 
                                                    row={{...r, t_sale: tSku - (tMr + tFr), t_mr_value: tMrValue, t_fr_value: tFrValue, t_amount: tAmount, t_db_comm: tDbComm, percentage, remark}} 
                                                    onChange={()=>{}} 
                                                    onRowPress={() => handleRowSelect(idx + mainRows.length)}
                                                    isSelected={selectedRowIndex === (idx + mainRows.length)}
                                                />
                                            );
                                        })}
                                    </ScrollView>
                                </View>
                                <View style={styles.footerRow}>
                                    <Text style={[styles.footerCell, { width: 100, fontWeight: '600' }]}>Totals</Text>
                                    <Text style={[styles.footerCell, { width: 60, textAlign: 'right', fontWeight: '600' }]}>{extraRows.reduce((s,r)=> s+(Number(r.t_sku)||0), 0)}</Text>
                                    <Text style={[styles.footerCell, { width: 60, textAlign: 'right', fontWeight: '600', color: '#dc2626' }]}>{extraRows.reduce((s,r)=> s+(Number(r.t_mr)||0), 0)}</Text>
                                    <Text style={[styles.footerCell, { width: 60, textAlign: 'right', fontWeight: '600', color: '#dc2626' }]}>{extraRows.reduce((s,r)=> s+(Number(r.t_fr)||0), 0)}</Text>
                                    <Text style={[styles.footerCell, { width: 70, textAlign: 'right', fontWeight: '600', color: '#059669' }]}>
                                        {extraRows.reduce((s,r)=> {
                                            const tSku = Number(r.t_sku) || 0;
                                            const tMr = Number(r.t_mr) || 0;
                                            const tFr = Number(r.t_fr) || 0;
                                            return s + (tSku - (tMr + tFr));
                                        }, 0)}
                                    </Text>
                                    <Text style={[styles.footerCell, { width: 80, textAlign: 'right', fontWeight: '600', color: '#dc2626' }]}>
                                        {extraRows.reduce((s,r)=> {
                                            const tMr = Number(r.t_mr) || 0;
                                            const delbRate = Number(r.delb_rate) || 0;
                                            return s + (tMr * delbRate);
                                        }, 0).toFixed(2)}
                                    </Text>
                                    <Text style={[styles.footerCell, { width: 80, textAlign: 'right', fontWeight: '600', color: '#dc2626' }]}>
                                        {extraRows.reduce((s,r)=> {
                                            const tFr = Number(r.t_fr) || 0;
                                            const delbRate = Number(r.delb_rate) || 0;
                                            return s + (tFr * delbRate);
                                        }, 0).toFixed(2)}
                                    </Text>
                                    <Text style={[styles.footerCell, { width: 80, textAlign: 'right', fontWeight: '600', color: '#059669' }]}>
                                        {extraRows.reduce((s,r)=> {
                                            const tMr = Number(r.t_mr) || 0;
                                            const tFr = Number(r.t_fr) || 0;
                                            const delbRate = Number(r.delb_rate) || 0;
                                            return s + ((tMr + tFr) * delbRate);
                                        }, 0).toFixed(2)}
                                    </Text>
                                    <Text style={[styles.footerCell, { width: 80, textAlign: 'right', fontWeight: '600', color: '#dc2626' }]}>{extraRows.reduce((s,r)=> s+(Number(r.db_comm)||0), 0)}</Text>
                                    <Text style={[styles.footerCell, { width: 70, textAlign: 'right', fontWeight: '600', color: '#059669' }]}>
                                        {(() => {
                                            const totalTMr = extraRows.reduce((s,r)=> s+(Number(r.t_mr)||0), 0);
                                            const totalTSku = extraRows.reduce((s,r)=> s+(Number(r.t_sku)||0), 0);
                                            return totalTSku > 0 ? ((totalTMr * 100) / totalTSku).toFixed(1) : '0.0';
                                        })()}%
                                    </Text>
                                    <Text style={[styles.footerCell, { width: 80, textAlign: 'right', fontWeight: '600', color: '#dc2626' }]}>
                                        {extraRows.reduce((s,r)=> {
                                            const tSku = Number(r.t_sku) || 0;
                                            const tMr = Number(r.t_mr) || 0;
                                            const tFr = Number(r.t_fr) || 0;
                                            return s + (tSku - (tMr + tFr));
                                        }, 0)}
                                    </Text>
                                </View>
                            </View>
                        </ScrollView>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

function SettingsTab() {
    const db = useSQLiteContext();
    const [skuName, setSkuName] = useState('');
    const [skuSeq, setSkuSeq] = useState('');
    const [workers, setWorkers] = useState<Array<{ id: number; username: string; location: string | null }>>([]);
    const [newWorker, setNewWorker] = useState<{ username: string; password: string; location?: string }>({ username: '', password: '', location: '' });
    useEffect(() => { (async () => setWorkers(await getWorkerDetails(db)))(); }, [db]);

    async function addSku() {
        const seq = Math.max(1, Number(skuSeq) || 0);
        await setSkuSequence(db, skuName.trim(), seq);
        setSkuName(''); setSkuSeq('');
    }

    async function addWorker() {
        if (!newWorker.username || !newWorker.password) return;
        const { createUser } = await import('../repositories/users');
        await createUser(db, { username: newWorker.username, password: newWorker.password, role: 'worker', location: newWorker.location });
        setWorkers(await getWorkerDetails(db));
        setNewWorker({ username: '', password: '', location: '' });
    }

    async function clearData() {
        try {
            const { Alert } = await import('react-native');
            Alert.alert('Confirm', 'This will remove all users (except admins) and all submissions. SKU names/sequence will be kept. Continue?', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'OK', style: 'destructive', onPress: async () => {
                    await db.runAsync('BEGIN');
                    try {
                        await db.runAsync(`DELETE FROM submission_lines`);
                        await db.runAsync(`DELETE FROM submissions`);
                        await db.runAsync(`DELETE FROM worker_rates`);
                        await db.runAsync(`DELETE FROM users WHERE role <> 'admin'`);
                        await db.runAsync('COMMIT');
                        setWorkers(await getWorkerDetails(db));
                        Alert.alert('Done', 'Cleared users and data; kept SKU names and sequence.');
                    } catch (e) {
                        await db.runAsync('ROLLBACK');
                        Alert.alert('Failed', String((e as any)?.message || e));
                    }
                } }
            ]);
        } catch {}
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff', padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 8 }}>Settings</Text>
            <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <Text style={{ fontWeight: '600', marginBottom: 8 }}>Add SKU</Text>
                <LabeledInput label="SKU Name" value={skuName} onChangeText={setSkuName} />
                <LabeledInput label="Position (Seq)" value={skuSeq} onChangeText={setSkuSeq} keyboardType="numeric" />
                <Pressable onPress={addSku} style={{ marginTop: 8, padding: 10, backgroundColor: '#0ea5e9', borderRadius: 8 }}><Text style={{ color: 'white', textAlign: 'center' }}>Add</Text></Pressable>
            </View>

            <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                <Text style={{ fontWeight: '600', marginBottom: 8 }}>Add Worker</Text>
                <LabeledInput label="Username" value={newWorker.username} onChangeText={(t)=>setNewWorker({ ...newWorker, username: t })} />
                <LabeledInput label="Password" value={newWorker.password} onChangeText={(t)=>setNewWorker({ ...newWorker, password: t })} secureTextEntry />
                <LabeledInput label="Location (optional)" value={newWorker.location} onChangeText={(t)=>setNewWorker({ ...newWorker, location: t })} />
                <Pressable onPress={addWorker} style={{ marginTop: 8, padding: 10, backgroundColor: '#10b981', borderRadius: 8 }}><Text style={{ color: 'white', textAlign: 'center' }}>Create Worker</Text></Pressable>
            </View>

            <View style={{ borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 12, padding: 12 }}>
                <Text style={{ fontWeight: '600', marginBottom: 8 }}>Workers</Text>
                <ScrollView style={{ maxHeight: 300 }}>
                    {workers.map((w) => (
                        <View key={w.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 }}>
                            <Text style={{ width: 120 }}>{w.username}</Text>
                            <LabeledInput label="Location" value={w.location ?? ''} onChangeText={async (t)=>{ await updateUserLocation(db, w.id, t); }} />
                            <Pressable onPress={async ()=>{ await deleteUser(db, w.id); setWorkers(await getWorkerDetails(db)); }} style={{ paddingHorizontal: 10, paddingVertical: 8, backgroundColor: '#ef4444', borderRadius: 8 }}><Text style={{ color: 'white' }}>Remove</Text></Pressable>
                        </View>
                    ))}
                </ScrollView>
            </View>

            <View style={{ borderWidth: 1, borderColor: '#fee2e2', backgroundColor: '#fff1f2', borderRadius: 12, padding: 12, marginTop: 12 }}>
                <Text style={{ fontWeight: '700', color: '#991b1b', marginBottom: 8 }}>Danger zone</Text>
                <Text style={{ color: '#7f1d1d', marginBottom: 8 }}>Clear all users (except admins) and all submissions. SKU names/sequence remain.</Text>
                <Pressable onPress={clearData} style={{ padding: 10, backgroundColor: '#dc2626', borderRadius: 8 }}><Text style={{ color: 'white', textAlign: 'center' }}>Clear Users and Data</Text></Pressable>
            </View>
        </SafeAreaView>
    );
}

function WorkersTab() {
    const db = useSQLiteContext();
    const today = new Date().toISOString().slice(0,10);
    const [rows, setRows] = useState<Array<{ id:number; worker:string; submitted:number }>>([]);
    const [selectedWorker, setSelectedWorker] = useState<number | null>(null);
    const [approvalData, setApprovalData] = useState<any[]>([]);
    const [showApprovalTable, setShowApprovalTable] = useState(false);
    
    useEffect(() => { (async () => setRows(await fetchTodaySubmissionStatus(db, today)))(); }, [db]);
    
    async function loadApprovalData(workerId: number) {
        const { fetchDetailedSubmissionForApproval } = await import('../repositories/submissions');
        // First get the submission ID for this worker and today's date
        const submissions = await db.getAllAsync(
            `SELECT id FROM submissions WHERE user_id = ? AND for_date = ? AND status = 'pending'`,
            [workerId, today]
        );
        
        if (submissions.length > 0) {
            const submissionId = (submissions[0] as any).id;
            const data = await fetchDetailedSubmissionForApproval(db, submissionId);
            setApprovalData(data);
            setShowApprovalTable(true);
        }
    }
    
    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            <View style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee' }}>
                <Text style={{ fontSize: 16, fontWeight: '600' }}>Workers • {today}</Text>
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
                <GridHeader columns={[{ key: 'worker', title: 'Worker', width: 120 }, { key: 'status', title: 'Status', width: 80 }, { key: 'actions', title: 'Actions', width: 100 }]} />
                {rows.map((r, idx) => (
                    <GridRow 
                        key={r.id} 
                        columns={[
                            { key: 'worker', title: 'Worker', width: 120, editable:false }, 
                            { key: 'status', title: 'Status', width: 80, editable:false },
                            { key: 'actions', title: 'Actions', width: 100, editable:false }
                        ]} 
                        row={{ 
                            worker: r.worker, 
                            status: r.submitted ? 'Submitted' : 'Not submitted',
                            actions: r.submitted ? 'View Details' : 'No Data'
                        } as any} 
                        onChange={()=>{}} 
                    />
                ))}
                
                {rows.map((r, idx) => (
                    <View key={`actions-${r.id}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: '#f0f0f0' }}>
                        <Text style={{ width: 120, fontSize: 12 }}>{r.worker}</Text>
                        <Text style={{ width: 80, fontSize: 12, color: r.submitted ? '#10b981' : '#ef4444' }}>
                            {r.submitted ? 'Submitted' : 'Not submitted'}
                        </Text>
                        <Pressable 
                            onPress={() => r.submitted && loadApprovalData(r.id)}
                            disabled={!r.submitted}
                            style={{ 
                                width: 100, 
                                padding: 6, 
                                backgroundColor: r.submitted ? '#3b82f6' : '#9ca3af', 
                                borderRadius: 4,
                                alignItems: 'center'
                            }}
                        >
                            <Text style={{ color: 'white', fontSize: 10 }}>
                                {r.submitted ? 'View Details' : 'No Data'}
                            </Text>
                        </Pressable>
                    </View>
                ))}
            </ScrollView>
            
            {showApprovalTable && (
                <View style={{ 
                    position: 'absolute', 
                    top: 0, 
                    left: 0, 
                    right: 0, 
                    bottom: 0, 
                    backgroundColor: 'rgba(0,0,0,0.5)', 
                    justifyContent: 'center', 
                    alignItems: 'center',
                    zIndex: 1000
                }}>
                    <View style={{ 
                        backgroundColor: 'white', 
                        width: '95%', 
                        height: '90%', 
                        borderRadius: 12, 
                        padding: 16 
                    }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                            <Text style={{ fontSize: 18, fontWeight: '600' }}>Detailed Submission Review</Text>
                            <Pressable 
                                onPress={() => setShowApprovalTable(false)}
                                style={{ padding: 8, backgroundColor: '#ef4444', borderRadius: 6 }}
                            >
                                <Text style={{ color: 'white' }}>Close</Text>
                            </Pressable>
                        </View>
                        
                        <ScrollView horizontal style={{ flex: 1 }}>
                            <View>
                                <GridHeader columns={[
                                    { key: 'sku_name', title: 'SKU Name', width: 100 },
                                    { key: 'mrp', title: 'MRP', width: 60, align: 'right' as const },
                                    { key: 'aw_rate', title: 'AW Rate', width: 70, align: 'right' as const },
                                    { key: 'retail_rate', title: 'Retail Rate', width: 80, align: 'right' as const },
                                    { key: 'db_rate', title: 'DB Rate', width: 70, align: 'right' as const },
                                    { key: 'shop_com', title: 'SHOP COM', width: 80, align: 'right' as const },
                                    { key: 'db_com', title: 'DB COM', width: 70, align: 'right' as const },
                                    { key: 'self', title: 'SELF', width: 60, align: 'right' as const },
                                    { key: 'sku', title: 'SKU', width: 60, align: 'right' as const },
                                    { key: 'mr', title: 'MR', width: 60, align: 'right' as const },
                                    { key: 'fr', title: 'FR', width: 60, align: 'right' as const },
                                    { key: 'sale', title: 'SALE', width: 60, align: 'right' as const },
                                    { key: 'mr_value', title: 'MR VALUE', width: 80, align: 'right' as const },
                                    { key: 'fr_value', title: 'FR VALUE', width: 80, align: 'right' as const },
                                    { key: 'sale_amount', title: 'SALE AMOUNT', width: 100, align: 'right' as const },
                                    { key: 'percentage', title: 'PERCENTAGE', width: 80, align: 'right' as const }
                                ]} />
                                {approvalData.map((row, idx) => (
                                    <GridRow 
                                        key={idx} 
                                        columns={[
                                            { key: 'sku_name', title: 'SKU Name', width: 100, editable: false },
                                            { key: 'mrp', title: 'MRP', width: 60, align: 'right' as const, editable: false },
                                            { key: 'aw_rate', title: 'AW Rate', width: 70, align: 'right' as const, editable: false },
                                            { key: 'retail_rate', title: 'Retail Rate', width: 80, align: 'right' as const, editable: false },
                                            { key: 'db_rate', title: 'DB Rate', width: 70, align: 'right' as const, editable: false },
                                            { key: 'shop_com', title: 'SHOP COM', width: 80, align: 'right' as const, editable: false },
                                            { key: 'db_com', title: 'DB COM', width: 70, align: 'right' as const, editable: false },
                                            { key: 'self', title: 'SELF', width: 60, align: 'right' as const, editable: false },
                                            { key: 'sku', title: 'SKU', width: 60, align: 'right' as const, editable: false },
                                            { key: 'mr', title: 'MR', width: 60, align: 'right' as const, editable: false },
                                            { key: 'fr', title: 'FR', width: 60, align: 'right' as const, editable: false },
                                            { key: 'sale', title: 'SALE', width: 60, align: 'right' as const, editable: false },
                                            { key: 'mr_value', title: 'MR VALUE', width: 80, align: 'right' as const, editable: false },
                                            { key: 'fr_value', title: 'FR VALUE', width: 80, align: 'right' as const, editable: false },
                                            { key: 'sale_amount', title: 'SALE AMOUNT', width: 100, align: 'right' as const, editable: false },
                                            { key: 'percentage', title: 'PERCENTAGE', width: 80, align: 'right' as const, editable: false }
                                        ]} 
                                        row={row} 
                                        onChange={() => {}} 
                                    />
                                ))}
                            </View>
                        </ScrollView>
                    </View>
                </View>
            )}
        </SafeAreaView>
    );
}

function RankingTab() {
    const db = useSQLiteContext();
    const [date, setDate] = useState<Date | null>(null);
    const [showPicker, setShowPicker] = useState<boolean>(false);
    const [rows, setRows] = useState<any[]>([]);
    async function refresh(d: Date | null = date) {
        const day = d ? d.toISOString().slice(0,10) : null;
        setRows(await fetchMrRanking(db, day));
    }
    useEffect(() => { void refresh(null); }, []);
    useEffect(() => { void refresh(date); }, [date]);
    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
            <View style={{ padding: 12, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontSize: 16, fontWeight: '600' }}>MR% Ranking (lower is better)</Text>
                <Pressable onPress={() => setShowPicker(true)} style={{ paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 999 }}>
                    <Text>{date ? date.toLocaleDateString() : 'All dates'}</Text>
                </Pressable>
                {showPicker ? (<DateTimePicker value={date ?? new Date()} mode="date" onChange={(e: any, d?: Date) => { setShowPicker(false); if (d) setDate(d); }} />) : null}
            </View>
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 12 }}>
                <GridHeader columns={[{ key: 'rank', title: '#', width: 40 }, { key: 'worker', title: 'Worker', width: 120 }, { key: 'mr_total', title: 'MR', width: 60, align: 'right' as const }, { key: 'sku_total', title: 'SKU', width: 60, align: 'right' as const }, { key: 'mr_percent', title: 'MR%', width: 60, align: 'right' as const }]} />
                {rows.map((r, idx) => (
                    <GridRow key={r.user_id} columns={[{ key: 'rank', title: '#', width: 40, editable:false }, { key: 'worker', title: 'Worker', width: 120, editable:false }, { key: 'mr_total', title: 'MR', width: 60, align: 'right' as const, editable:false }, { key: 'sku_total', title: 'SKU', width: 60, align: 'right' as const, editable:false }, { key: 'mr_percent', title: 'MR%', width: 60, align: 'right' as const, editable:false }]} row={{ rank: idx+1, worker: r.worker, mr_total: r.mr_total, sku_total: r.sku_total, mr_percent: r.mr_percent.toFixed(2) } as any} onChange={()=>{}} />
                ))}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: '#fff' },
	headerBar: {
		paddingTop: 18,
		paddingBottom: 12,
		paddingHorizontal: 12,
		borderBottomWidth: 1,
		borderColor: '#eee',
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	headerTitle: { fontSize: 16, fontWeight: '600' },
	signOutBtn: {
		paddingHorizontal: 12,
		paddingVertical: 8,
		borderRadius: 999,
		borderWidth: 1,
		borderColor: '#cbd5e1',
		backgroundColor: '#fff',
		shadowColor: '#000',
		shadowOpacity: 0.06,
		shadowRadius: 4,
		shadowOffset: { width: 0, height: 2 },
		elevation: 2,
	},
	signOutText: { color: '#0f172a', fontWeight: '600' },
    columnToggleBtn: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        backgroundColor: '#f8fafc',
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 4,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
    },
    columnToggleText: { color: '#0f172a', fontWeight: '600', fontSize: 12 },
	gridArea: { flex: 1 },
	sheetContainer: {
		minWidth: 1100,
		flex: 1,
		backgroundColor: '#fff',
		borderWidth: 1,
		borderColor: '#d1d5db',
		borderRadius: 12,
		overflow: 'hidden',
	},
	footerRow: {
		flexDirection: 'row',
		borderTopWidth: 1,
		borderColor: '#ddd',
		height: 40,
		alignItems: 'center',
	},
	footerCell: { paddingHorizontal: 8 },
	totalsRow: {
		flexDirection: 'row',
		borderTopWidth: 2,
		borderColor: '#333',
		backgroundColor: '#f8f9fa',
		height: 40,
		alignItems: 'center',
	},
	totalsCell: { 
		paddingHorizontal: 8,
		fontSize: 14,
		borderRightWidth: 1,
		borderColor: '#ddd',
		height: 40,
		textAlignVertical: 'center',
	},
});



