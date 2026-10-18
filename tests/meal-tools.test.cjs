const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {environment}=require('./helpers/meal-env.cjs');
test('review and cancellation do not change stored meals',()=>{
 const e=environment();e.run(`openMealReview({name:'غداء',cal:500,protein:30},'library')`);assert.equal(e.run('appState.meals.length'),0);e.run('closeModal()');assert.equal(e.run('appState.meals.length'),0);
});
test('barcode portion scales, saves once, and preserves decimals',()=>{
 const e=environment();e.run(`openMealReview({name:'زبادي',cal:120,protein:7.5,components:[{name:'زبادي',quantity:100,unit:'غ',cal:120,protein:7.5}]},'barcode')`);
 e.get('meal-part-0-quantity').value='50';e.get('meal-part-0-quantity').events.input();assert.equal(+e.get('meal-part-0-cal').value,60);assert.equal(+e.get('meal-part-0-protein').value,3.8);
 e.run('saveMealReview();saveMealReview()');assert.equal(e.run('appState.meals.length'),1);assert.equal(e.run('appState.meals[0].cal'),60);assert.equal(e.run('appState.meals[0].source'), 'barcode');assert.equal(e.run('appState.meals[0].sourceEdited'),true);
});
test('editing one record preserves date, id and original saved meal',()=>{
 const e=environment();e.run(`appState.meals=[{id:123,date:todayStr(),timestamp:123,name:'غداء',cal:500,protein:30,carbs:40,fat:15,sugar:2,fiber:3}];appState.customMeals=[{name:'غداء',cal:500}];openLoggedMealReview(0)`);
 e.get('meal-part-0-cal').value='450.5';e.run('saveMealReview()');assert.equal(e.run('appState.meals.length'),1);assert.equal(e.run('appState.meals[0].id'),123);assert.equal(e.run('appState.meals[0].cal'),450.5);assert.equal(e.run('appState.customMeals[0].cal'),500);
});
test('negative or non-finite values never reach storage',()=>{
 const e=environment();e.run(`openMealReview({name:'وجبة',cal:100},'manual')`);e.get('meal-part-0-cal').value='-1';e.run('saveMealReview()');assert.equal(e.run('appState.meals.length'),0);assert.match(e.get('meal-review-error').textContent,/دون قيم سالبة/);
 e.get('meal-part-0-cal').value='Infinity';e.run('saveMealReview()');assert.equal(e.run('appState.meals.length'),0);
});
test('inconsistent AI breakdown keeps total and explains fallback',()=>{
 const e=environment();e.run(`openMealReview({name:'غداء',cal:500,components:[{name:'أرز',cal:100}]},'photo')`);assert.equal(e.get('meal-part-0-cal').value,'500');assert.equal(e.run('mealReviewDraft.components.length'),1);assert.match(e.run('mealReviewDraft.assumptions.join()'),/لا يطابق/);
});
test('untrusted meal names are escaped in review markup',()=>{
 const e=environment();e.run(`openMealReview({name:'<img src=x onerror=alert(1)>',cal:100},'text')`);assert.ok(!e.get('modal-body').innerHTML.includes('<img src=x'));assert.ok(e.get('modal-body').innerHTML.includes('&lt;img'));
});
test('legacy logs and unmodified AI entries retain source honesty',()=>{
 const e=environment();e.run(`openMealReview({name:'غداء',cal:400},'text');saveMealReview()`);assert.equal(e.run('appState.meals[0].sourceEdited'),false);assert.equal(e.run(`mealSourceLabel('unknown')`),'سجل سابق — المصدر غير محدد');
});
test('daily guidance matches dashboard net convention and actual protein',()=>{
 const e=environment();assert.equal(e.run(`mealDayBalance({dailyCalories:2000,protein:140},[{cal:900,protein:60}],[{cal:200}]).remaining`),1300);
 assert.equal(e.run(`mealDayBalance({dailyCalories:2000,protein:140},[{cal:900,protein:60}],[{cal:200}]).proteinRemaining`),80);
 e.run(`appState.meals=[{date:todayStr(),name:'غداء',cal:600,protein:30,timestamp:1}]`);
 assert.match(e.run('mealGuidanceText(mealDayBalance())'),/1400 سعرة و110 غ بروتين/);
});
test('suggestions fit the remaining budget and honor exclusions',()=>{
 const e=environment();e.run(`appState.customMeals=[{name:'وجبة مخصصة بالبيض',cal:250,protein:30},{name:'وجبة دجاج خاصة',cal:300,protein:35}]`);
 const result=e.run(`mealSuggestionCandidates({remaining:350,proteinRemaining:40},{slot:'dinner',exclude:'بيض، تونا',useSaved:true})`);
 assert.ok(result.some(x=>x.name==='وجبة دجاج خاصة'));
 assert.ok(!result.some(x=>x.name.includes('بيض')||x.name.includes('تونا')));
 assert.ok(result.filter(x=>x.fits).every(x=>Number(x.cal)<=350));
 assert.equal(result[0].fits,true);
});
test('suggestions do not save meals or modify goals, including no budget',()=>{
 const e=environment();e.run(`appState.customMeals=[]`);
 const prior=e.run('JSON.stringify(appState.profile)');const result=e.run(`mealSuggestionCandidates({remaining:-100,proteinRemaining:0},{slot:'lunch'})`);
 assert.ok(result.length);assert.ok(result.every(x=>!x.fits));assert.equal(e.run('appState.meals.length'),0);assert.equal(e.run('JSON.stringify(appState.profile)'),prior);
});
test('meal edit preserves unrelated progress, fasting, water and recipes',()=>{
 const e=environment();e.run(`appState.water=4;appState.weights=[{date:todayStr(),weight:80}];appState.cuttingPlan={calories:2000,checkins:[{week:2}]};appState.fasting={active:true,startTime:123};appState.customMeals=[{name:'وصفة',cal:450}];appState.meals=[{id:'legacy-id',date:todayStr(),name:'وجبة',cal:500}];`);
 const before=e.run('JSON.stringify([appState.water,appState.weights,appState.cuttingPlan,appState.fasting,appState.customMeals])');
 e.run('openLoggedMealReview(0)');e.get('meal-part-0-cal').value='400';e.run('saveMealReview()');
 assert.equal(e.run('JSON.stringify([appState.water,appState.weights,appState.cuttingPlan,appState.fasting,appState.customMeals])'),before);
});

test('saved review survives reload through the existing storage format',()=>{
 const e=environment();e.run(`saveCurrentUserData=realSaveCurrentUserData;openMealReview({name:'وجبة محفوظة',cal:123.5,protein:10.2},'manual');saveMealReview();appState={profile:null,meals:[]};appState=loadUsersDB()[LOCAL_PROFILE_ID];`);
 assert.equal(e.run('appState.meals.length'),1);assert.equal(e.run('appState.meals[0].cal'),123.5);assert.equal(e.run('appState.profile.dailyCalories'),2000);
});
test('manual entry needs its name only once',()=>{
 const e=environment();e.run('openManualMealModal()');e.get('meal-review-name').value='فطور';e.get('meal-review-name').events.input({target:e.get('meal-review-name')});e.get('meal-part-0-cal').value='250';e.run('saveMealReview()');assert.equal(e.run('appState.meals[0].name'),'فطور');
});
test('barcode missing energy never invents a calorie value',async()=>{
 const e=environment();e.ctx.fetch=async()=>({json:async()=>({status:1,product:{product_name:'منتج',nutriments:{}}})});await e.run("lookupBarcode('1234567890123')");assert.match(e.get('barcode-result-preview').innerHTML,/غير متوفرة/);assert.equal(e.run('pendingMealAnalyses.size'),0);
});
test('barcode lookup carries the 100g serving basis into review',async()=>{
 const e=environment();e.ctx.fetch=async()=>({json:async()=>({status:1,product:{product_name:'منتج',nutriments:{'energy-kcal_100g':120,proteins_100g:7.5}}})});await e.run("lookupBarcode('1234567890123')");assert.equal(e.run("pendingMealAnalyses.get('barcode-result-preview').result.components[0].quantity"),100);assert.equal(e.run("pendingMealAnalyses.get('barcode-result-preview').source"),'barcode');
});
test('library and saved meals add immediately without opening a review form',()=>{
 const e=environment();e.run("addPresetCombo('فطور',300,20,25,10,2,3);appState.customMeals=[{name:'عشاء',cal:450,protein:35}];addCustomMealToLog(0)");assert.equal(e.run('appState.meals.length'),2);assert.equal(e.run('mealReviewDraft'),null);assert.equal(e.get('modal-body').innerHTML,'');assert.equal(e.run('appState.meals[0].cal'),300);
});
test('analysis adds once on confirmation and keeps later editing available',()=>{
 const e=environment();e.run("showMealAnalysis('meal-text-preview',{name:'غداء',calories:500,protein:30},'text')");assert.equal(e.run('appState.meals.length'),0);assert.doesNotMatch(e.get('meal-text-preview').innerHTML,/مراجعة وتعديل ثم حفظ/);const add=e.get('meal-text-preview').querySelector('[data-review-analysis]');add.events.click();add.events.click();assert.equal(e.run('appState.meals.length'),1);assert.equal(e.run('mealReviewDraft'),null);assert.equal(e.run('appState.meals[0].source'),'text');
 const id=e.run('appState.meals[0].id');e.run('openLoggedMealReview(0)');e.get('meal-part-0-cal').value='480';e.run('saveMealReview()');assert.equal(e.run('appState.meals.length'),1);assert.equal(e.run('appState.meals[0].id'),id);assert.equal(e.run('appState.meals[0].cal'),480);
});
test('barcode keeps a simple gram amount and scales without a second editor',()=>{
 const e=environment();e.run("showMealAnalysis('barcode-result-preview',{name:'زبادي',calories:120,protein:8},'barcode')");const add=e.get('barcode-result-preview').querySelector('[data-review-analysis]');e.get('barcode-result-preview-quantity').value='-2';add.events.click();assert.equal(e.run('appState.meals.length'),0);e.get('barcode-result-preview-quantity').value='50';add.events.click();assert.equal(e.run('appState.meals[0].cal'),60);assert.equal(e.run('appState.meals[0].protein'),4);assert.equal(e.run('appState.meals[0].components[0].quantity'),50);assert.equal(e.run('mealReviewDraft'),null);
});
test('direct entry rejects invalid data and preserves unrelated progress',()=>{
 const e=environment();const before=e.run('JSON.stringify([appState.profile,appState.water,appState.weights,appState.fasting])');assert.equal(e.run("addMealDirect({name:'',cal:200},'text')"),false);assert.equal(e.run("addMealDirect({name:'وجبة',cal:-1},'library')"),false);e.run("addMealDirect({name:'عشاء',cal:350},'library')");assert.equal(e.run('appState.meals.length'),1);assert.equal(e.run('JSON.stringify([appState.profile,appState.water,appState.weights,appState.fasting])'),before);
});
