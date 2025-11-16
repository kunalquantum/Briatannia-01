import { useEffect, useMemo, useState, useRef } from 'react';
import { SafeAreaView, View, StyleSheet, Text, ScrollView, Pressable, Modal, ImageBackground, TextInput, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { PanGestureHandler, State } from 'react-native-gesture-handler';
import { LinearGradient } from 'expo-linear-gradient';
import DateTimePicker from '@react-native-community/datetimepicker';
import { GridHeader } from '../components/grid/GridHeader';
import { GridRow } from '../components/grid/GridRow';
import { useAuth } from '../auth/AuthContext';
import { LabeledInput } from '../components/ui/LabeledInput';
import { useSQLiteContext } from 'expo-sqlite';
import { insertSubmission, getSubmissionLinesForDate, getAdminOrdersForLocation } from '../repositories/submissions';
import { getWorkerRates, getSkuSequence, getWorkerDbRates } from '../repositories/rates';

type Line = {
	name: string;
    sku?: number;
    mr?: number;
    fr?: number;
    delbRate?: number;
    sale?: number;
    amount?: number;
	percent?: string;
	order?: string;
};

const COLUMNS = [
    { key: 'name', title: 'SKU', width: 80, onPressKey: '__openModal', editable: false },
    { key: 'sku', title: 'SKU', width: 50, align: 'right' as const, keyboard: 'numeric' as const },
    { key: 'mr', title: 'MR', width: 50, align: 'right' as const, keyboard: 'numeric' as const, color: '#dc2626' },
    { key: 'fr', title: 'FR', width: 50, align: 'right' as const, keyboard: 'numeric' as const },
    { key: 'sale', title: 'SALE', width: 50, align: 'right' as const, editable: false },
    { key: 'amount', title: 'AMT', width: 80, align: 'right' as const, editable: false },
    { key: 'order', title: 'ORD', width: 50, align: 'right' as const },
];

const DEFAULT_SKUS: string[] = [
	'LARGE 350','ECO 800','HALF 150','POP 500','BR 400','FRT 200','H ATTA 200','MD 200','MG 400','WW 450','H SLICE 450','600 GM','BR 200','POP 250','MG 200','ATTA 400','BUM 70','A.KULCHA','M.KULCHA','BUR 200','BUR 100','PAV 250','GAR 300','BOMB.PAV','VAN 50','CHO 50','M PIZZA 150','M BUN','SLICE',"D'nt Worry",'FINGER','TOAST','C.ROLL'
];

// Helper function to get day of week
const getDayOfWeek = (date: Date): string => {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[date.getDay()];
};

// Function to get the correct image for each SKU
const getSkuImage = (skuName?: string) => {
    if (!skuName) return require('../assets/icon.png');
    
    // Map SKU names to their corresponding images (only for files that actually exist)
    const skuImageMap: { [key: string]: any } = {
        'LARGE 350': require('../assets/SKUs/Large 350.png'),
        'ECO 800': require('../assets/SKUs/ECO 800.png'),
        'BR 400': require('../assets/SKUs/BR 400.png'),
        'FRT 200': require('../assets/SKUs/FRT 200.png'),
        'H ATTA 200': require('../assets/SKUs/H ATTA 200.png'),
        'MG 400': require('../assets/SKUs/MG 400.png'),
        'WW 450': require('../assets/SKUs/VV 450.png'), // Using VV 450 image for WW 450
        'WW 250': require('../assets/SKUs/VV 450.png'), // Using VV 450 image for WW 250
        'H SLICE 450': require('../assets/SKUs/H SLICE 450.png'),
        '600 GM': require('../assets/SKUs/600 GM.png'),
        'BR 200': require('../assets/SKUs/BR200.png'),
        'POP 250': require('../assets/SKUs/BR200.png'), // Using BR200 image for POP 250
        'MG 200': require('../assets/SKUs/MG200.png'),
        'ATTA 400': require('../assets/SKUs/AT 400.png'),
        'BUM 70': require('../assets/SKUs/BUN70.png'),
        'A.KULCHA': require('../assets/SKUs/AK.png'),
        'M.KULCHA': require('../assets/SKUs/MK.png'),
        'BUR 200': require('../assets/SKUs/BUR200.png'),
        'BUR 100': require('../assets/SKUs/BUR200.png'), // Using BUR200 image for BUR 100
        'PAV 250': require('../assets/SKUs/PAV250.png'),
        'GAR 300': require('../assets/SKUs/PAV250.png'), // Using PAV250 image for GAR 300
        'BOMB.PAV': require('../assets/SKUs/PAV250.png'), // Using PAV250 image for BOMB.PAV
        'VAN 50': require('../assets/SKUs/V450.png'),
        'CHO 50': require('../assets/SKUs/CHD50.png'),
        'M PIZZA 150': require('../assets/SKUs/MP150.png'),
        'M BUN': require('../assets/SKUs/MP150.png'), // Using MP150 image for M BUN
        'SLICE': require('../assets/SKUs/MP150.png'), // Using MP150 image for SLICE
        "D'nt Worry": require('../assets/SKUs/MP150.png'), // Using MP150 image for D'nt Worry
        'FINGER': require('../assets/SKUs/MP150.png'), // Using MP150 image for FINGER
        'TOAST': require('../assets/SKUs/MP150.png'), // Using MP150 image for TOAST
        'C.ROLL': require('../assets/SKUs/MP150.png'), // Using MP150 image for C.ROLL
    };
    
    return skuImageMap[skuName] || require('../assets/icon.png');
};

export default function Worker() {
    const { logout, user } = useAuth();
    const db = useSQLiteContext();
    const [date, setDate] = useState<Date>(new Date());
    const [showPicker, setShowPicker] = useState<boolean>(false);
    const [skuList, setSkuList] = useState<string[]>(DEFAULT_SKUS);
    const [rows, setRows] = useState<Line[]>(() =>
        DEFAULT_SKUS.map((name) => ({ 
            name, 
            sku: 0, 
            mr: 0, 
            fr: 0, 
            delbRate: 0, 
            sale: 0, 
            amount: 0, 
            percent: '0%', 
            order: '' 
        }))
    );
    const [dbRates, setDbRates] = useState<Record<string, number>>({});
    const [refreshTrigger, setRefreshTrigger] = useState(0);
    const [modalRow, setModalRow] = useState<Line | null>(null);
    const [modalIndex, setModalIndex] = useState<number | null>(null);
    const [currentSkuIndex, setCurrentSkuIndex] = useState<number>(0);
    const [focusedCell, setFocusedCell] = useState<{rowIndex: number, columnIndex: number} | null>(null);
    const [isKeyboardVisible, setKeyboardVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const gridRefs = useRef<{[key: string]: any}>({});
    const mainScrollRef = useRef<ScrollView>(null);
    const extraScrollRef = useRef<ScrollView>(null);
    const mainContentScrollRef = useRef<ScrollView>(null);
    const isScrolling = useRef<boolean>(false);
    const dbRatesRef = useRef<Record<string, number>>({});

    // Helper function to recalculate amounts for a row
    const recalculateRowAmounts = (row: Line, dbRates: Record<string, number>): Line => {
        const sale = (Number(row.sku) || 0) - (Number(row.mr) || 0) - (Number(row.fr) || 0);
        const dbRate = dbRates[row.name] || 0;
        const amount = Number((sale * dbRate).toFixed(3));
        console.log(`[recalculateRowAmounts] SKU: ${row.name}, SKU value: ${row.sku}, MR: ${row.mr}, FR: ${row.fr}, Sale: ${sale}, DB Rate: ${dbRate}, Amount: ${amount}`);
        return { ...row, sale: sale, amount: amount };
    };
    
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

    // Debug currentSkuIndex changes
    useEffect(() => {
        console.log('currentSkuIndex changed to:', currentSkuIndex);
    }, [currentSkuIndex]);

    // Keyboard visibility listeners
    useEffect(() => {
        const keyboardDidShowListener = Keyboard.addListener('keyboardDidShow', () => {
            setKeyboardVisible(true);
            // Scroll to payment section when keyboard appears
            setTimeout(() => {
                if (mainContentScrollRef.current) {
                    mainContentScrollRef.current.scrollToEnd({ animated: true });
                }
            }, 100);
        });
        const keyboardDidHideListener = Keyboard.addListener('keyboardDidHide', () => {
            setKeyboardVisible(false);
        });

        return () => {
            keyboardDidShowListener?.remove();
            keyboardDidHideListener?.remove();
        };
    }, []);

    // Handle swipe gestures for horizontal navigation
    const handleSwipeGesture = (event: any) => {
        const { translationX, state } = event.nativeEvent;
        
        if (state === State.END) {
            const swipeThreshold = 30; // Minimum distance to trigger swipe
            
            if (translationX > swipeThreshold) {
                // Swipe right - go to previous SKU
                console.log('Swipe right detected');
                setCurrentSkuIndex(Math.max(0, currentSkuIndex - 1));
            } else if (translationX < -swipeThreshold) {
                // Swipe left - go to next SKU
                console.log('Swipe left detected');
                setCurrentSkuIndex(Math.min(rows.length - 1, currentSkuIndex + 1));
            }
        }
    };

    // Navigation functions
    const goToPrevious = () => {
        console.log('Previous button pressed, current index:', currentSkuIndex);
        setCurrentSkuIndex(Math.max(0, currentSkuIndex - 1));
    };

    const goToNext = () => {
        console.log('Next button pressed, current index:', currentSkuIndex);
        setCurrentSkuIndex(Math.min(rows.length - 1, currentSkuIndex + 1));
    };

    // Define the exact extra products we want to show - ONLY these 6
    const allowedExtraProducts = ['M BUN', 'SLICE', "D'nt Worry", 'FINGER', 'TOAST', 'C.ROLL'];
    
    // Partition SKUs into main (up to M PIZZA 150) and extra products
    const mp150IndexInDefault = DEFAULT_SKUS.findIndex((n) => n === 'M PIZZA 150');
    const mainSkuNamesDefault = mp150IndexInDefault >= 0 ? DEFAULT_SKUS.slice(0, mp150IndexInDefault + 1) : DEFAULT_SKUS;
    const mainSet = new Set(mainSkuNamesDefault);
    
    // Main rows: everything up to and including M PIZZA 150
    const mainRows = rows.filter((r) => mainSet.has(r.name));
    
    // Extra rows: Use the actual rows from state, not create new ones
    const extraRows = rows.filter((r) => allowedExtraProducts.includes(r.name));
    
    // Debug logging to see what's in extraRows
    console.log('Extra products found:', extraRows.map(r => r.name));
    console.log('M PIZZA 150 index:', mp150IndexInDefault);
    console.log('Main SKUs:', mainSkuNamesDefault);

    // Load SKU sequence (global) and reorder table for all workers
    useEffect(() => {
        (async () => {
            const seq = await getSkuSequence(db);
            if (seq && seq.length > 0) {
                const ordered = seq.map((s: any) => s.name);
                const missing = DEFAULT_SKUS.filter((n) => !ordered.includes(n));
                const list = [...ordered, ...missing];
                setSkuList(list);
                setRows((prev) => {
                    const byName: Record<string, Line> = {};
                    for (const r of prev) byName[r.name] = r;
                    return list.map((name) => byName[name] ?? { 
                        name, 
                        sku: 0, 
                        mr: 0, 
                        fr: 0, 
                        delbRate: 0, 
                        sale: 0, 
                        amount: 0, 
                        percent: '0%', 
                        order: '' 
                    } as Line);
                });
            }
        })();
    }, [db]);

    // Prefill SKU from previous day's order values when the date changes
    useEffect(() => {
        if (!user) return;
        (async () => {
            const prev = new Date(date.getTime());
            prev.setDate(date.getDate() - 1);
            const prevDate = prev.toISOString().slice(0, 10);
            
            console.log(`Loading order values from ${prevDate} to prefill SKU for ${date.toISOString().slice(0, 10)}`);
            
            const prevLines = await getSubmissionLinesForDate(db, user.id, prevDate);
            if (!prevLines || prevLines.length === 0) {
                console.log('No previous day data found');
                return;
            }
            
            const nameToOrder: Record<string, number> = {};
            for (const l of prevLines) {
                const orderValue = Number(l.ordering) || 0;
                if (orderValue > 0) {
                    nameToOrder[l.name] = orderValue;
                    console.log(`Prefilling ${l.name}: order=${l.ordering} -> sku=${orderValue}`);
                }
            }
            
            setRows((current) => current.map((r) => {
                const newSku = nameToOrder[r.name] ?? r.sku ?? 0;
                if (nameToOrder[r.name] !== undefined) {
                    console.log(`Setting SKU for ${r.name}: ${r.sku} -> ${newSku}`);
                }
                return { ...r, sku: newSku };
            }));
        })();
    }, [db, user, date]);

    // Load delivery rates from admin configuration for this worker
    useEffect(() => {
        if (!user) return;
        (async () => {
            const rates = await getWorkerRates(db, user.id);
            setRows((current) => current.map((r) => ({ ...r, delbRate: rates[r.name] ?? r.delbRate ?? 0 })));
        })();
    }, [db, user]);

    // Load DB rates from admin configuration for this worker
    useEffect(() => {
        if (!user) return;
        (async () => {
            try {
                const dbRatesData = await getWorkerDbRates(db, user.id);
                console.log('[Worker] Loaded DB rates from database:', dbRatesData);
                console.log('[Worker] Number of rates loaded:', Object.keys(dbRatesData).length);
                console.log('[Worker] Sample rates:', Object.entries(dbRatesData).slice(0, 5));
                
                if (Object.keys(dbRatesData).length === 0) {
                    console.warn('[Worker] WARNING: No DB rates found in database for worker ID:', user.id);
                }
                
                setDbRates(dbRatesData);
                dbRatesRef.current = dbRatesData; // Update ref with latest rates
                
                // Recalculate amounts when DB rates are loaded
                setRows((current) => {
                    const updated = current.map((r) => {
                        const recalculated = recalculateRowAmounts(r, dbRatesData);
                        return recalculated;
                    });
                    console.log('[Worker] Recalculated all rows after loading rates');
                    return updated;
                });
            } catch (error) {
                console.error('[Worker] Error loading DB rates:', error);
            }
        })();
    }, [db, user]);

    // Load admin orders as SKU values for current date
    useEffect(() => {
        if (!user?.location) return;
        (async () => {
            try {
                const adminOrders = await getAdminOrdersForLocation(
                    db, 
                    date.toISOString().slice(0, 10), 
                    user.location!
                );
                
                if (Object.keys(adminOrders).length > 0) {
                    console.log('Loading admin orders as SKU values:', adminOrders);
                    
                    setRows((current) => current.map((r) => {
                        const adminOrderValue = adminOrders[r.name] || 0;
                        if (adminOrderValue > 0) {
                            console.log(`Setting SKU for ${r.name} from admin order: ${r.sku} -> ${adminOrderValue}`);
                            
                            // Calculate derived fields when SKU is updated from admin orders - use ref for latest rates
                            const updatedRow = { ...r, sku: adminOrderValue };
                            return recalculateRowAmounts(updatedRow, dbRatesRef.current);
                        }
                        return r;
                    }));
                }
            } catch (error) {
                console.error('Failed to load admin orders:', error);
            }
        })();
    }, [db, user?.location, date, refreshTrigger, dbRates]);

    // Recalculate amounts whenever dbRates change
    useEffect(() => {
        if (Object.keys(dbRates).length > 0) {
            console.log('[Worker] dbRates changed, recalculating all rows with rates:', dbRates);
            dbRatesRef.current = dbRates; // Update ref whenever dbRates changes
            setRows((current) => {
                const updated = current.map((r) => {
                    const recalculated = recalculateRowAmounts(r, dbRates);
                    return recalculated;
                });
                console.log('[Worker] Recalculated all rows after dbRates change');
                return updated;
            });
        } else {
            console.warn('[Worker] dbRates is empty, cannot recalculate amounts');
        }
    }, [dbRates]);

    // Real-time refresh mechanism to check for admin order changes
    useEffect(() => {
        if (!user?.location) return;
        
        const interval = setInterval(async () => {
            try {
                const adminOrders = await getAdminOrdersForLocation(
                    db, 
                    date.toISOString().slice(0, 10), 
                    user.location!
                );
                
                // Check if any admin orders have changed
                const hasChanges = Object.keys(adminOrders).some(skuName => {
                    const currentRow = rows.find(r => r.name === skuName);
                    return currentRow && (adminOrders[skuName] || 0) !== (currentRow.sku || 0);
                });
                
                if (hasChanges) {
                    console.log('Admin orders changed, refreshing worker SKU values');
                    setRefreshTrigger(prev => prev + 1);
                }
            } catch (error) {
                console.error('Failed to check admin orders:', error);
            }
        }, 5000); // Check every 5 seconds
        
        return () => clearInterval(interval);
    }, [db, user?.location, date, rows]);

    const totals = useMemo(() => {
        const sumMain = (k: keyof Line) => mainRows.reduce((s, r) => s + (Number((r as any)[k]) || 0), 0);
        const sumExtra = (k: keyof Line) => extraRows.reduce((s, r) => s + (Number((r as any)[k]) || 0), 0);
        return {
            sku: sumMain('sku'),
            mr: sumMain('mr'),
            fr: sumMain('fr'),
            sale: sumMain('sale'),
            amount: sumMain('amount'),
            extraAmount: sumExtra('amount'),
        };
    }, [rows, mainRows, extraRows]);

    const [prevBalance, setPrevBalance] = useState<number>(0);
    const [cash, setCash] = useState<number>(0);
    const [online, setOnline] = useState<number>(0);
    const todaysAmount = Math.round(totals.amount + totals.extraAmount);
    const totalBalance = Math.round(prevBalance + todaysAmount);
    const remainingBalance = totalBalance - (cash + online);

    function handleChange(rowIndex: number, key: string, text: string) {
		setRows((prev) => {
			const next = [...prev];
			const row = { ...next[rowIndex] } as any;
            // numeric assignment for relevant fields
            if (key === '__openModal') {
                console.log('Opening modal for SKU:', next[rowIndex].name, 'at index:', rowIndex);
                setModalRow(next[rowIndex] as any);
                setModalIndex(rowIndex);
                setCurrentSkuIndex(rowIndex);
            } else if (['sku','mr','fr'].includes(key)) {
                row[key] = Number(text) || 0;
            } else if (key === 'order' || key === 'name') {
                row[key] = text;
            }
            // compute derived fields using helper function - use ref to get latest dbRates
            const currentDbRates = dbRatesRef.current;
            console.log(`[handleChange] Field changed: ${key} = ${text} for SKU: ${row.name}`);
            console.log(`[handleChange] Current row values - SKU: ${row.sku}, MR: ${row.mr}, FR: ${row.fr}`);
            console.log(`[handleChange] Available DB rates for this SKU:`, currentDbRates[row.name] !== undefined ? currentDbRates[row.name] : 'NOT FOUND');
            console.log(`[handleChange] All available DB rates:`, Object.keys(currentDbRates));
            
            const recalculated = recalculateRowAmounts(row, currentDbRates);
            console.log(`[handleChange] Recalculated amount: ${recalculated.amount}`);
            next[rowIndex] = recalculated;
            return next;
		});
	}

    // Excel-like navigation: move to next row when Enter is pressed
    function handleEnterPress(rowIndex: number, columnIndex: number) {
        const nextRowIndex = rowIndex + 1;
        if (nextRowIndex < mainRows.length) {
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
            <LinearGradient colors={["#10b981", "#0ea5e9"]} style={{ flex: 1 }}>
                <View style={styles.headerBar}>
                    {/* Top row - Date/Day and Sign out */}
                    <View style={styles.headerTop}>
                        <Pressable onPress={() => setShowPicker(true)} style={styles.calendarBtn}>
                            <Text style={styles.dayText}>{getDayOfWeek(date)}</Text>
                            <Text style={styles.calendarText}>{date.toLocaleDateString()}</Text>
                        </Pressable>
                        {showPicker ? (
                            <DateTimePicker
                                value={date}
                                mode="date"
                                onChange={(e: any, d?: Date) => {
                                    setShowPicker(false);
                                    if (d) setDate(d);
                                }}
                            />
                        ) : null}
                        <Pressable onPress={logout} style={styles.signOutBtn}>
                            <Text style={styles.signOutText}>Sign out</Text>
                        </Pressable>
                    </View>
                    
                    {/* Bottom row - Location and Username */}
                    <View style={styles.headerBottom}>
                        <Text style={styles.locationText}>{(user?.location || 'No Location').toUpperCase()}</Text>
                        <Text style={styles.usernameText}>{(user?.username || 'Worker').toUpperCase()}</Text>
                    </View>
                </View>
                <KeyboardAvoidingView 
                    style={{ flex: 1 }} 
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                >
                    <ScrollView 
                        ref={mainContentScrollRef}
                        style={{ flex: 1 }} 
                        contentContainerStyle={{ paddingBottom: 24 }}
                        keyboardShouldPersistTaps="handled"
                    >
                <View style={styles.gridWrapper}>
                        <ScrollView 
                            ref={mainScrollRef}
                            horizontal 
                            bounces={false}
                            onScroll={handleMainScroll}
                            scrollEventThrottle={16}
                        >
                            <View style={[styles.sheetContainer, { borderBottomLeftRadius: extraRows.length > 0 ? 0 : 12, borderBottomRightRadius: extraRows.length > 0 ? 0 : 12 }]}>
                                <GridHeader columns={COLUMNS} />
                                <View style={{ flex: 1 }}>
                                    <ScrollView style={{ height: 360 }} nestedScrollEnabled>
                                    {mainRows.map((row, idx) => {
                                            const originalIndex = rows.findIndex(r => r.name === row.name);
                                            return (
                                            <GridRow
                                                key={row.name + idx}
                                                columns={COLUMNS}
                                                row={row as any}
                                                    rowIndex={originalIndex}
                                                    onChange={(key, val) => handleChange(originalIndex, key, val)}
                                                    onEnterPress={(columnIndex) => handleEnterPress(originalIndex, columnIndex)}
                                                />
                                            );
                                        })}
                                    </ScrollView>
                                </View>
                            <View style={styles.footerRow}>
                                <Text style={[styles.footerCell, { width: 80, fontWeight: '700', fontSize: 16 }]}>Totals</Text>
                                <Text style={[styles.footerCell, { width: 50, textAlign: 'right', fontWeight: '700', fontSize: 16 }]}>{totals.sku}</Text>
                                <Text style={[styles.footerCell, { width: 50, textAlign: 'right', fontWeight: '700', fontSize: 16 }]}>{totals.mr}</Text>
                                <Text style={[styles.footerCell, { width: 50, textAlign: 'right', fontWeight: '700', fontSize: 16 }]}>{totals.fr}</Text>
                                <Text style={[styles.footerCell, { width: 50, textAlign: 'right', fontWeight: '700', fontSize: 16 }]}>{totals.sale}</Text>
                                <Text style={[styles.footerCell, { width: 80, textAlign: 'right', fontWeight: '800', fontSize: 18, color: '#059669' }]}>{totals.amount.toFixed(3)}</Text>
                                <View style={{ width: 50 }} />
                            </View>
                            </View>
                        </ScrollView>
                    </View>

                {extraRows.length > 0 && (
                    <View style={{ paddingHorizontal: 12, marginTop: 0 }}>
                        <LinearGradient colors={["#10b981", "#059669"]} style={{ borderRadius: 0, padding: 8, borderTopWidth: 2, borderTopColor: '#047857' }}>
                        <ScrollView 
                            ref={extraScrollRef}
                            horizontal 
                            bounces={false}
                            onScroll={handleExtraScroll}
                            scrollEventThrottle={16}
                        >
                                <View style={[styles.sheetContainer, { backgroundColor: 'rgba(255,255,255,0.95)', borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
                                <GridHeader columns={COLUMNS} />
                                <View style={{ flex: 1 }}>
                                    <ScrollView style={{ height: 240 }} nestedScrollEnabled>
                                        {extraRows.map((row, idx) => {
                                            const originalIndex = rows.findIndex(r => r.name === row.name);
                                            return (
                                            <GridRow
                                                key={row.name + idx}
                                                columns={COLUMNS}
                                                row={row as any}
                                                    rowIndex={originalIndex}
                                                    onChange={(key, val) => handleChange(originalIndex, key, val)}
                                                    onEnterPress={(columnIndex) => handleEnterPress(originalIndex, columnIndex)}
                                                />
                                            );
                                        })}
                                    </ScrollView>
                                </View>
                                <View style={styles.footerRow}>
                                    <Text style={[styles.footerCell, { width: 80, fontWeight: '700', fontSize: 16 }]}>Total</Text>
                                    <View style={{ width: 50 }} />
                                    <View style={{ width: 50 }} />
                                    <View style={{ width: 50 }} />
                                    <View style={{ width: 50 }} />
                                    <Text style={[styles.footerCell, { width: 80, textAlign: 'right', fontWeight: '800', fontSize: 18, color: '#059669' }]}>{(totals.amount + totals.extraAmount).toFixed(3)}</Text>
                                    <View style={{ width: 50 }} />
                                </View>
                            </View>
                        </ScrollView>
                        </LinearGradient>
                    </View>
                )}

                    <View style={[styles.paymentCard, isKeyboardVisible && styles.paymentCardKeyboard]}>
                        <Text style={styles.sectionTitle}>PAYMENTS</Text>
                        <View style={styles.paymentContainer}>
                            {/* Left side */}
                            <View style={styles.paymentLeft}>
                                <View style={styles.payCol}><LabeledInput label="TODAY'S AMOUNT" value={String(todaysAmount)} editable={false} style={{ height: 40, fontSize: 16, fontWeight: '700', color: '#f59e0b' }} /></View>
                                <View style={styles.payCol}><LabeledInput label="PREV BAL" value={String(prevBalance)} keyboardType="numeric" onChangeText={(t) => setPrevBalance(Math.round(Number(t) || 0))} style={{ height: 40, fontSize: 16, fontWeight: '700', color: '#f59e0b' }} /></View>
                                <View style={styles.payCol}><LabeledInput label="TOTAL BALANCE" value={String(totalBalance)} editable={false} style={{ height: 40, fontSize: 16, fontWeight: '700', color: '#ef4444' }} /></View>
                            </View>
                            
                            {/* Right side */}
                            <View style={styles.paymentRight}>
                                <View style={styles.payCol}><LabeledInput label="CASH" value={String(cash)} keyboardType="numeric" onChangeText={(t) => { const n = Math.round(Number(t) || 0); setCash(n); }} style={{ height: 40, fontSize: 16, fontWeight: '700', color: '#059669' }} /></View>
                                <View style={styles.payCol}><LabeledInput label="ONLINE" value={String(online)} keyboardType="numeric" onChangeText={(t) => { const n = Math.round(Number(t) || 0); setOnline(n); }} style={{ height: 40, fontSize: 16, fontWeight: '700', color: '#059669' }} /></View>
                                <View style={styles.payCol}><LabeledInput label="REMAINING BALANCE" value={String(remainingBalance)} editable={false} style={{ height: 40, fontSize: 16, fontWeight: '700', color: '#ef4444' }} /></View>
                            </View>
                        </View>
                    </View>

                    <View style={{ paddingHorizontal: 12, marginTop: 12, alignItems: 'center' }}>
                        <Pressable 
                            onPress={async () => {
                                if (!user || isSubmitting) return;
                                
                                setIsSubmitting(true);
                                setSubmitSuccess(false);
                                
                                try {
                                    const forDate = date.toISOString().slice(0, 10);
                                    const dayOfWeek = getDayOfWeek(date);
                                    await insertSubmission(db, {
                                        userId: user.id,
                                        location: user.role === 'worker' ? user.location ?? null : null,
                                        forDate,
                                        dayOfWeek,
                                        Totals: { sku: totals.sku, mr: totals.mr, fr: totals.fr, sale: totals.sale, amount: todaysAmount },
                                        Payments: { cash, online, previousBalance: prevBalance, totalDue: totalBalance, remainingDue: remainingBalance },
                                        Lines: rows.map(r => ({ name: r.name, sku: r.sku, mr: r.mr, fr: r.fr, delbRate: r.delbRate, dbRate: dbRates[r.name] || 0, sale: r.sale, amount: r.amount, order: r.order })),
                                    });
                                    
                                    // Show success indicator
                                    setSubmitSuccess(true);
                                    
                                    // Reset success indicator after 2 seconds
                                    setTimeout(() => {
                                        setSubmitSuccess(false);
                                    }, 2000);
                                    
                                } catch (error) {
                                    console.error('Failed to submit:', error);
                                } finally {
                                    setIsSubmitting(false);
                                }
                            }} 
                            style={[styles.submitBtn, isSubmitting && styles.submitBtnLoading, submitSuccess && styles.submitBtnSuccess]}
                            disabled={isSubmitting}
                        >
                            <Text style={styles.submitText}>
                                {isSubmitting ? 'SENDING...' : submitSuccess ? 'SENT!' : 'OK'}
                            </Text>
                        </Pressable>
                    </View>
                    </ScrollView>
                </KeyboardAvoidingView>
                <Modal visible={!!modalRow} transparent animationType="fade" onRequestClose={() => { setModalRow(null); setModalIndex(null); }}>
                    <KeyboardAvoidingView 
                        style={{ flex:1, backgroundColor:'rgba(0,0,0,0.5)' }} 
                        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
                    >
                        <View style={{ flex:1, paddingHorizontal:8, paddingVertical:16 }}>
                            <View style={{ flex:1, borderRadius:16, overflow:'hidden', backgroundColor:'#f8fafc', borderWidth:2, borderColor:'#e0f2fe', shadowColor:'#0ea5e9', shadowOffset:{width:0, height:8}, shadowOpacity:0.2, shadowRadius:16, elevation:12 }}>
                            <PanGestureHandler onGestureEvent={handleSwipeGesture} onHandlerStateChange={handleSwipeGesture}>
                                <View style={{ flex:1, flexDirection:'row' }}>
                                    {/* Image Section - Left side (75%) */}
                                    <View style={{ flex:0.75, position:'relative', backgroundColor:'#f0f9ff' }}>
                                        <ImageBackground 
                                            source={getSkuImage(rows[currentSkuIndex]?.name)} 
                                            resizeMode="contain" 
                                            style={{ flex:1, marginLeft:8, marginRight:8, marginBottom:8, marginTop:60, borderRadius:8 }}
                                        >
                                            {/* SKU Name in center */}
                                            <View style={{ position:'absolute', top:20, left:0, right:0, alignItems:'center' }}>
                                                <View style={{ 
                                                    backgroundColor:'#667eea', 
                                                    paddingHorizontal:24, 
                                                    paddingVertical:16, 
                                                    borderRadius:30,
                                                    shadowColor:'#667eea',
                                                    shadowOffset:{width:0, height:4},
                                                    shadowOpacity:0.4,
                                                    shadowRadius:8,
                                                    elevation:8,
                                                    borderWidth:2,
                                                    borderColor:'#5a67d8'
                                                }}>
                                                    <Text style={{ 
                                                        color:'white', 
                                                        fontWeight:'700', 
                                                        fontSize:32,
                                                        textShadowColor:'rgba(0,0,0,0.3)',
                                                        textShadowOffset:{width:0, height:2},
                                                        textShadowRadius:4
                                                    }}>
                                                        {rows[currentSkuIndex]?.name}
                                                    </Text>
                                                </View>
                                            </View>
                                            

                                            {/* AMOUNT field in middle */}
                                            <View style={{ position:'absolute', bottom:80, left:20, right:20, alignItems:'center' }}>
                                                <View style={{ 
                                                    backgroundColor:'#10b981', 
                                                    paddingHorizontal:24, 
                                                    paddingVertical:16, 
                                                    borderRadius:30, 
                                                    width:'100%', 
                                                    alignItems:'center',
                                                    shadowColor:'#10b981',
                                                    shadowOffset:{width:0, height:4},
                                                    shadowOpacity:0.4,
                                                    shadowRadius:8,
                                                    elevation:8,
                                                    borderWidth:2,
                                                    borderColor:'#059669'
                                                }}>
                                                    <Text style={{ 
                                                        color:'white', 
                                                        fontWeight:'700', 
                                                        fontSize:32, 
                                                        marginBottom:8,
                                                        textShadowColor:'rgba(0,0,0,0.3)',
                                                        textShadowOffset:{width:0, height:2},
                                                        textShadowRadius:4
                                                    }}>AMOUNT</Text>
                                                    <Text style={{ 
                                                        color:'white', 
                                                        fontWeight:'600', 
                                                        fontSize:32,
                                                        textShadowColor:'rgba(0,0,0,0.3)',
                                                        textShadowOffset:{width:0, height:2},
                                                        textShadowRadius:4
                                                    }}>{(rows[currentSkuIndex]?.amount || 0).toFixed(3)}</Text>
                                                </View>
                                            </View>
                                            
                                            {/* Navigation arrows at bottom */}
                                            <View style={{ position:'absolute', bottom:20, left:0, right:0, flexDirection:'row', justifyContent:'center', gap:16 }}>
                                                <Pressable 
                                                    onPress={goToPrevious}
                                                    style={{ 
                                                        backgroundColor: '#f59e0b', 
                                                        paddingHorizontal:16, 
                                                        paddingVertical:12, 
                                                        borderRadius:25,
                                                        minWidth:50,
                                                        alignItems:'center',
                                                        shadowColor:'#f59e0b',
                                                        shadowOffset:{width:0, height:3},
                                                        shadowOpacity:0.4,
                                                        shadowRadius:6,
                                                        elevation:6,
                                                        borderWidth:2,
                                                        borderColor:'#d97706'
                                                    }}
                                                >
                                                    <Text style={{ color:'white', fontWeight:'700', fontSize:18, textShadowColor:'rgba(0,0,0,0.3)', textShadowOffset:{width:0, height:1}, textShadowRadius:2 }}>←</Text>
                                                </Pressable>
                                                <View style={{ 
                                                    backgroundColor:'#8b5cf6', 
                                                    paddingHorizontal:16, 
                                                    paddingVertical:12, 
                                                    borderRadius:25, 
                                                    alignItems:'center',
                                                    shadowColor:'#8b5cf6',
                                                    shadowOffset:{width:0, height:3},
                                                    shadowOpacity:0.4,
                                                    shadowRadius:6,
                                                    elevation:6,
                                                    borderWidth:2,
                                                    borderColor:'#7c3aed'
                                                }}>
                                                    <Text style={{ 
                                                        color:'white', 
                                                        fontWeight:'700', 
                                                        fontSize:14,
                                                        textShadowColor:'rgba(0,0,0,0.3)',
                                                        textShadowOffset:{width:0, height:1},
                                                        textShadowRadius:2
                                                    }}>
                                                        {currentSkuIndex + 1} / {rows.length}
                                                    </Text>
                                                </View>
                                                <Pressable 
                                                    onPress={goToNext}
                                                    style={{ 
                                                        backgroundColor: '#f59e0b', 
                                                        paddingHorizontal:16, 
                                                        paddingVertical:12, 
                                                        borderRadius:25,
                                                        minWidth:50,
                                                        alignItems:'center',
                                                        shadowColor:'#f59e0b',
                                                        shadowOffset:{width:0, height:3},
                                                        shadowOpacity:0.4,
                                                        shadowRadius:6,
                                                        elevation:6,
                                                        borderWidth:2,
                                                        borderColor:'#d97706'
                                                    }}
                                                >
                                                    <Text style={{ color:'white', fontWeight:'700', fontSize:18, textShadowColor:'rgba(0,0,0,0.3)', textShadowOffset:{width:0, height:1}, textShadowRadius:2 }}>→</Text>
                                                </Pressable>
                                            </View>
                                        </ImageBackground>
                                    </View>
                                    
                                    {/* Form Section - Right side (25%) */}
                                    <View style={{ flex:0.25, backgroundColor:'#f0f9ff', borderLeftWidth:3, borderLeftColor:'#0ea5e9', padding:12 }}>
                                        <View style={{ flex:1, justifyContent:'space-between' }}>
                                            {/* Input fields - Reordered sequence: SKU, MR, FR, SALE, Amount */}
                                            <View style={{ gap:8 }}>
                                                <View style={{ 
                                                    backgroundColor:'#3b82f6', 
                                                    paddingHorizontal:12, 
                                                    paddingVertical:8, 
                                                    borderRadius:20, 
                                                    alignItems:'center',
                                                    shadowColor:'#3b82f6',
                                                    shadowOffset:{width:0, height:3},
                                                    shadowOpacity:0.3,
                                                    shadowRadius:6,
                                                    elevation:6,
                                                    borderWidth:2,
                                                    borderColor:'#2563eb'
                                                }}>
                                                    <Text style={{ color:'white', fontWeight:'700', fontSize:18, marginBottom:4, textShadowColor:'rgba(0,0,0,0.3)', textShadowOffset:{width:0, height:1}, textShadowRadius:2 }}>SKU</Text>
                                                        <TextInput 
                                                            value={String(rows[currentSkuIndex]?.sku || 0)} 
                                                            onChangeText={(t)=>handleChange(currentSkuIndex,'sku',t)} 
                                                            keyboardType="numeric" 
                                                        style={{ 
                                                            backgroundColor:'white', 
                                                            borderColor:'#d1d5db', 
                                                            borderWidth:1,
                                                            borderRadius:8,
                                                            paddingHorizontal:16, 
                                                            height:50, 
                                                            fontSize:20,
                                                            fontWeight:'600',
                                                            textAlign:'center',
                                                            width:'90%',
                                                            color:'#1f2937',
                                                            minWidth:80
                                                        }} 
                                                        />
                                                    </View>
                                                    
                                                <View style={{ 
                                                    backgroundColor:'#ef4444', 
                                                    paddingHorizontal:12, 
                                                    paddingVertical:8, 
                                                    borderRadius:20, 
                                                    alignItems:'center',
                                                    shadowColor:'#ef4444',
                                                    shadowOffset:{width:0, height:3},
                                                    shadowOpacity:0.3,
                                                    shadowRadius:6,
                                                    elevation:6,
                                                    borderWidth:2,
                                                    borderColor:'#dc2626'
                                                }}>
                                                    <Text style={{ color:'white', fontWeight:'700', fontSize:18, marginBottom:4, textShadowColor:'rgba(0,0,0,0.3)', textShadowOffset:{width:0, height:1}, textShadowRadius:2 }}>MR</Text>
                                                        <TextInput 
                                                            value={String(rows[currentSkuIndex]?.mr || 0)} 
                                                            onChangeText={(t)=>handleChange(currentSkuIndex,'mr',t)} 
                                                            keyboardType="numeric" 
                                                        style={{ 
                                                            backgroundColor:'white', 
                                                            borderColor:'#d1d5db', 
                                                            borderWidth:1,
                                                            borderRadius:8,
                                                            paddingHorizontal:16, 
                                                            height:50, 
                                                            fontSize:20,
                                                            fontWeight:'600',
                                                            textAlign:'center',
                                                            width:'90%',
                                                            color:'#dc2626',
                                                            minWidth:80
                                                        }} 
                                                        />
                                                    </View>
                                                    
                                                <View style={{ 
                                                    backgroundColor:'#8b5cf6', 
                                                    paddingHorizontal:12, 
                                                    paddingVertical:8, 
                                                    borderRadius:20, 
                                                    alignItems:'center',
                                                    shadowColor:'#8b5cf6',
                                                    shadowOffset:{width:0, height:3},
                                                    shadowOpacity:0.3,
                                                    shadowRadius:6,
                                                    elevation:6,
                                                    borderWidth:2,
                                                    borderColor:'#7c3aed'
                                                }}>
                                                    <Text style={{ color:'white', fontWeight:'700', fontSize:18, marginBottom:4, textShadowColor:'rgba(0,0,0,0.3)', textShadowOffset:{width:0, height:1}, textShadowRadius:2 }}>FR</Text>
                                                        <TextInput 
                                                            value={String(rows[currentSkuIndex]?.fr || 0)} 
                                                            onChangeText={(t)=>handleChange(currentSkuIndex,'fr',t)} 
                                                            keyboardType="numeric" 
                                                        style={{ 
                                                            backgroundColor:'white', 
                                                            borderColor:'#d1d5db', 
                                                            borderWidth:1,
                                                            borderRadius:8,
                                                            paddingHorizontal:16, 
                                                            height:50, 
                                                            fontSize:20,
                                                            fontWeight:'600',
                                                            textAlign:'center',
                                                            width:'90%',
                                                            color:'#1f2937',
                                                            minWidth:80
                                                        }} 
                                                        />
                                                    </View>
                                                    
                                                    {/* Calculated values */}
                                                <View style={{ 
                                                    backgroundColor:'#06b6d4', 
                                                    paddingHorizontal:12, 
                                                    paddingVertical:8, 
                                                    borderRadius:20, 
                                                    alignItems:'center',
                                                    shadowColor:'#06b6d4',
                                                    shadowOffset:{width:0, height:3},
                                                    shadowOpacity:0.3,
                                                    shadowRadius:6,
                                                    elevation:6,
                                                    borderWidth:2,
                                                    borderColor:'#0891b2'
                                                }}>
                                                    <Text style={{ color:'white', fontWeight:'700', fontSize:18, marginBottom:4, textShadowColor:'rgba(0,0,0,0.3)', textShadowOffset:{width:0, height:1}, textShadowRadius:2 }}>SALE</Text>
                                                    <Text style={{ color:'white', fontWeight:'600', fontSize:22, textShadowColor:'rgba(0,0,0,0.3)', textShadowOffset:{width:0, height:1}, textShadowRadius:2 }}>{rows[currentSkuIndex]?.sale || 0}</Text>
                                                    </View>
                                                    
                                                <View style={{ 
                                                    backgroundColor:'#f59e0b', 
                                                    paddingHorizontal:10, 
                                                    paddingVertical:6, 
                                                    borderRadius:20, 
                                                    alignItems:'center',
                                                    shadowColor:'#f59e0b',
                                                    shadowOffset:{width:0, height:3},
                                                    shadowOpacity:0.3,
                                                    shadowRadius:6,
                                                    elevation:6,
                                                    borderWidth:2,
                                                    borderColor:'#d97706'
                                                }}>
                                                    <Text style={{ color:'white', fontWeight:'700', fontSize:14, marginBottom:1, textAlign:'center', textShadowColor:'rgba(0,0,0,0.3)', textShadowOffset:{width:0, height:1}, textShadowRadius:2 }} numberOfLines={1}>ORD</Text>
                                                        <TextInput 
                                                            value={String(rows[currentSkuIndex]?.order || '')} 
                                                            onChangeText={(t)=>handleChange(currentSkuIndex,'order',t)} 
                                                            keyboardType="numeric"
                                                        style={{ 
                                                            backgroundColor:'white', 
                                                            borderColor:'#d1d5db', 
                                                            borderWidth:1,
                                                            borderRadius:8,
                                                            paddingHorizontal:16, 
                                                            height:50, 
                                                            fontSize:20,
                                                            fontWeight:'600',
                                                            textAlign:'center',
                                                            width:'90%',
                                                            color:'#1f2937',
                                                            minWidth:80,
                                                            marginTop:1
                                                        }} 
                                                        />
                                                    </View>
                                                    
                                            </View>
                                            
                                            {/* Close button */}
                                            <View style={{ marginTop:20, marginBottom:10, alignItems:'flex-end' }}>
                                                <Pressable 
                                                    onPress={() => { setModalRow(null); setModalIndex(null); setCurrentSkuIndex(0); }} 
                                                    style={{ 
                                                        paddingHorizontal:20, 
                                                        paddingVertical:12, 
                                                        backgroundColor:'#ef4444', 
                                                        borderRadius:8,
                                                        shadowColor:'#ef4444',
                                                        shadowOffset:{width:0, height:3},
                                                        shadowOpacity:0.3,
                                                        shadowRadius:6,
                                                        elevation:6,
                                                        borderWidth:2,
                                                        borderColor:'#dc2626'
                                                    }}
                                                >
                                                    <Text style={{ 
                                                        color:'white', 
                                                        fontWeight:'700', 
                                                        fontSize:14,
                                                        textShadowColor:'rgba(0,0,0,0.3)',
                                                        textShadowOffset:{width:0, height:1},
                                                        textShadowRadius:2
                                                    }}>Close</Text>
                                                </Pressable>
                                            </View>
                                        </View>
                                    </View>
                                </View>
                            </PanGestureHandler>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </Modal>
            </LinearGradient>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: '#fff' },
    headerBar: {
        paddingTop: 22,
        paddingBottom: 16,
        paddingHorizontal: 12,
        borderBottomWidth: 1,
        borderColor: '#eee',
    },
    headerTop: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    headerBottom: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    usernameText: { 
        fontSize: 18, 
        fontWeight: '800', 
        color: '#ffffff',
        backgroundColor: '#059669',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 12,
        textAlign: 'center',
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        elevation: 6,
        borderWidth: 2,
        borderColor: '#047857',
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
    locationText: { 
        fontSize: 18, 
        fontWeight: '800', 
        color: '#ffffff',
        backgroundColor: '#3b82f6',
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 12,
        textAlign: 'center',
        shadowColor: '#3b82f6',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        elevation: 6,
        borderWidth: 2,
        borderColor: '#1d4ed8',
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
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
    calendarBtn: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        backgroundColor: '#fff',
        alignItems: 'center',
        minWidth: 80,
    },
    dayText: { 
        color: '#059669', 
        fontWeight: '700', 
        fontSize: 12,
        textTransform: 'uppercase',
    },
    calendarText: { 
        color: '#0f172a', 
        fontWeight: '600', 
        fontSize: 14,
    },
	gridArea: { flex: 1 },
    sheetContainer: {
        minWidth: 800,
        flex: 1,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#d1d5db',
        borderRadius: 12,
        overflow: 'hidden',
    },
    gridWrapper: {
        paddingHorizontal: 12,
        paddingTop: 12,
    },
	footerRow: {
		flexDirection: 'row',
		borderTopWidth: 1,
		borderColor: '#ddd',
		height: 40,
		alignItems: 'center',
	},
	footerCell: {
		paddingHorizontal: 8,
	},
    paymentCard: {
        marginTop: 16,
        marginHorizontal: 12,
        paddingVertical: 20,
        paddingHorizontal: 16,
        backgroundColor: '#fff',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#d1d5db',
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 4 },
        elevation: 3,
    },
    paymentCardKeyboard: {
        marginTop: 8,
        marginBottom: 8,
        paddingVertical: 16,
    },
    sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
    rowGap: { gap: 10 },
    paymentContainer: {
        flexDirection: 'row',
        gap: 20,
    },
    paymentLeft: {
        flex: 1,
        gap: 12,
    },
    paymentRight: {
        flex: 1,
        gap: 12,
    },
    payGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 12,
    },
    payCol: {
        width: '100%',
    },
    submitBtn: {
        backgroundColor: '#059669',
        paddingHorizontal: 32,
        paddingVertical: 12,
        borderRadius: 12,
        alignItems: 'center',
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 3 },
        shadowOpacity: 0.4,
        shadowRadius: 6,
        elevation: 6,
        borderWidth: 2,
        borderColor: '#047857',
        minWidth: 100,
    },
    submitBtnLoading: {
        backgroundColor: '#f59e0b',
        borderColor: '#d97706',
        shadowColor: '#f59e0b',
    },
    submitBtnSuccess: {
        backgroundColor: '#10b981',
        borderColor: '#059669',
        shadowColor: '#10b981',
    },
    submitText: {
        fontSize: 30, 
        fontWeight: '900', 
        color: '#ffffff',
        textAlign: 'center',
        textShadowColor: 'rgba(0,0,0,0.3)',
        textShadowOffset: { width: 0, height: 1 },
        textShadowRadius: 2,
    },
	detailRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	detailLabel: {
		fontSize: 16,
		fontWeight: '600',
		width: 120,
	},
	detailValue: {
		fontSize: 16,
		fontWeight: '600',
		color: '#0f172a',
	},
	detailInput: {
		borderWidth: 1,
		borderColor: '#d1d5db',
		borderRadius: 8,
		paddingHorizontal: 12,
		height: 40,
		minWidth: 100,
		fontSize: 14,
		backgroundColor: '#fff',
		color: '#1f2937',
	},
});


