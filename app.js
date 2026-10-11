(() => {
  'use strict';

  const STORAGE = { draft:'printKobo.draft.v1', templates:'printKobo.templates.v1', documents:'printKobo.documents.v1' };
  const SUBJECTS = {
    japanese:{label:'国語',color:'#b84e4e'}, math:{label:'算数',color:'#3e6fa6'}, science:{label:'理科',color:'#47805c'},
    social:{label:'社会',color:'#c77732'}, english:{label:'外国語',color:'#75599b'}, other:{label:'その他',color:'#315b52'}
  };
  const PARTS = [
    ['heading','見出し','▰'],['text','説明','☰'],['goal','めあて','◎'],['question','問題','?'],['answerline','一行解答','＿'],
    ['ruled','記述','≡'],['calc','計算','＋'],['grid','方眼','▦'],['kanji','漢字練習マス','あ'],['choice','選択問題','☑'],['table','表','▤'],['image','画像','▧'],
    ['navi','NAVI','☺'],['summary','まとめ','✓'],['reflection','ふりかえり','↗'],['score','得点欄','点']
  ];
  const NAVI_BASE = 'https://tt-sensei.github.io/navi-character-/assets/web/groups/learning/';
  const NAVI = [
    ['国語・話し合い','group-learning-japanese-discussion.webp'],['国語・読書','group-learning-japanese-reading.webp'],
    ['算数・図を使う','group-learning-math-diagram.webp'],['算数・図形','group-learning-math-shapes.webp'],
    ['相談する','group-learning-pair-consulting.webp'],['黒板で考える','group-learning-pair-blackboard.webp'],
    ['長さを測る','group-learning-pair-measure-length.webp'],['観察する','group-learning-pair-observation.webp'],
    ['いっしょに読む','group-learning-pair-reading.webp'],['理科・実験','group-learning-science-experiment.webp'],
    ['理科・観察','group-learning-science-observation.webp'],['社会・地図','group-learning-social-map.webp']
  ];
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const clone = obj => JSON.parse(JSON.stringify(obj));
  const uid = () => 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const nl = value => esc(value).replace(/\n/g,'<br>');
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));

  let worksheet = null;
  let selectedId = null;
  let displayMode = 'student';
  let zoom = .75;
  let history = [];
  let future = [];
  let saveTimer = 0;
  let toastTimer = 0;

  function newWorksheet(subject='other', writingMode='horizontal') {
    const now = new Date().toISOString();
    return { id:uid(), name:'無題のプリント', title:'学習プリント', subtitle:'', subject, paperSize:'A4', orientation:'portrait', writingMode,
      margin:'standard', fontSize:'standard', lineHeight:'standard', showGrade:true, showClass:true, showName:true, showDate:true,
      grade:'6', className:'', date:'', createdAt:now, updatedAt:now, blocks:[] };
  }

  function makeBlock(type, overrides={}) {
    const defaults = {
      heading:{content:'見出し',width:100,alignment:'left',fontSize:15,bold:true,background:false},
      text:{content:'ここに説明や指示を書きます。',width:100,alignment:'left',writingMode:'auto',fontSize:10.5,lineHeight:1.65,frame:false},
      goal:{content:'今日の学習のめあてを書きます。',width:100,alignment:'left',writingMode:'auto'},
      question:{content:'問題文を入力してください。',answer:'',width:100,numbered:true,writingMode:'auto'},
      answerline:{content:'',width:100,height:10,writingMode:'horizontal'},
      ruled:{content:'',width:100,height:35,lines:true,lineGap:8,writingMode:'horizontal'},
      calc:{content:'',width:100,height:40,pattern:'blank',writingMode:'horizontal'},
      grid:{content:'',width:100,height:45,writingMode:'horizontal'},
      kanji:{content:'',sample:'',width:100,rows:2,cols:8,cellSize:'medium',writingMode:'horizontal'},
      choice:{content:'問題文を入力してください。',answer:'',width:100,marker:'kana',choices:['選択肢1','選択肢2','選択肢3','選択肢4'],writingMode:'auto'},
      table:{content:'',width:100,rows:3,cols:3,cells:Array(9).fill(''),writingMode:'horizontal'},
      image:{content:'',width:100,height:45,imageUrl:'',alignment:'center',writingMode:'horizontal'},
      navi:{content:'',width:33,height:32,imageUrl:NAVI_BASE+NAVI[0][1],alignment:'right',writingMode:'horizontal'},
      summary:{content:'学習のまとめを書きます。',width:100,alignment:'left',writingMode:'auto'},
      reflection:{content:'わかったこと',width:100,height:24,lines:true,writingMode:'auto'},
      score:{content:'得点',width:33,total:100,writingMode:'horizontal'}
    };
    return { id:uid(), type, ...clone(defaults[type]), ...overrides };
  }

  const PRESETS = [
    {id:'blank',icon:'□',name:'自由',desc:'空のA4から作る',subject:'other',build:w=>w},
    {id:'math',icon:'＋',name:'算数',desc:'問題と計算スペース',subject:'math',build:w=>addPreset(w,[['goal',{}],['question',{content:'① 問題文を入力します。',numbered:false}],['calc',{}],['question',{content:'② 問題文を入力します。',numbered:false}],['calc',{}],['reflection',{content:'今日の学習を振り返ろう。'}]])},
    {id:'japanese',icon:'あ',name:'国語',desc:'本文・問題・記述欄',subject:'japanese',build:w=>addPreset(w,[['text',{content:'本文や資料文を入力します。',frame:true}],['question',{}],['ruled',{height:40}],['question',{}],['ruled',{height:40}]])},
    {id:'vertical',icon:'縦',name:'国語・縦書き',desc:'縦書きの国語教材',subject:'japanese',writingMode:'vertical',build:w=>addPreset(w,[['text',{content:'ここに縦書きの本文を入力します。',height:70}],['question',{}],['ruled',{height:45,writingMode:'horizontal'}]])},
    {id:'kanji',icon:'漢',name:'漢字',desc:'漢字マスとミニテスト',subject:'japanese',build:w=>addPreset(w,[['heading',{content:'漢字練習'}],['kanji',{rows:2,cols:8,cellSize:'medium'}],['heading',{content:'ミニテスト'}],['kanji',{rows:1,cols:8,cellSize:'medium'}]])},
    {id:'science',icon:'⚗',name:'理科',desc:'予想・結果・考察',subject:'science',build:w=>addPreset(w,[['goal',{}],['heading',{content:'予想'}],['ruled',{height:25}],['heading',{content:'実験・観察'}],['text',{content:'方法や注意点を書きます。',frame:true}],['heading',{content:'結果'}],['ruled',{height:30}],['summary',{content:'考察・まとめ'}],['ruled',{height:30}]])},
    {id:'social',icon:'地',name:'社会',desc:'資料・問題・まとめ',subject:'social',build:w=>addPreset(w,[['heading',{content:'資料'}],['image',{}],['question',{}],['ruled',{height:35}],['summary',{}]])},
    {id:'test',icon:'点',name:'ミニテスト',desc:'得点欄と問題',subject:'other',build:w=>addPreset(w,[['score',{}],['question',{}],['answerline',{}],['question',{}],['answerline',{}],['question',{}],['answerline',{}]])},
    {id:'reflection',icon:'↗',name:'ふりかえり',desc:'できたことと次の目標',subject:'other',build:w=>addPreset(w,[['goal',{content:'今日のめあて'}],['reflection',{content:'できたこと',height:24}],['reflection',{content:'わかったこと',height:30}],['reflection',{content:'次にがんばること',height:24}]])}
  ];
  function addPreset(w, list){ w.blocks=list.map(([t,o])=>makeBlock(t,o)); return w; }

  function init() {
    renderParts();
    const draft = read(STORAGE.draft,null);
    $('#draftInfo').textContent = draft ? `${draft.name || draft.title}（${formatDate(draft.updatedAt)}）` : 'まだ自動保存はありません';
    bindEvents();
    if (location.hash === '#edit' && draft) openEditor(draft);
  }

  function bindEvents() {
    document.addEventListener('click', handleClick);
    $('#settingsContent').addEventListener('input', handleSettingsInput);
    $('#settingsContent').addEventListener('change', handleSettingsChange);
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){ e.preventDefault(); e.shiftKey?redo():undo(); }
      if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y'){ e.preventDefault(); redo(); }
      if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='s'){ e.preventDefault(); openSaveDialog(); }
    });
    document.addEventListener('focusin', e => {
      const cell=e.target.closest('[data-table-cell]');
      if(cell && !cell.dataset.started && !$('#previewOverlay').contains(cell)){ commit();cell.dataset.started='1'; }
      const inline=e.target.closest('[data-inline-prop]');
      if(inline && !inline.dataset.started && !$('#previewOverlay').contains(inline)){ commit();inline.dataset.started='1'; }
    });
    document.addEventListener('input', e => {
      const cell=e.target.closest('[data-table-cell]'); if(!cell || $('#previewOverlay').contains(cell))return;
      const b=worksheet.blocks.find(x=>x.id===cell.closest('.block')?.dataset.id); if(!b)return;
      b.cells[Number(cell.dataset.tableCell)]=cell.innerText; worksheet.updatedAt=new Date().toISOString();scheduleSave();
    });
    document.addEventListener('input', e => {
      const inline=e.target.closest('[data-inline-prop]'); if(!inline || $('#previewOverlay').contains(inline))return;
      const b=worksheet.blocks.find(x=>x.id===inline.closest('.block')?.dataset.id); if(!b)return;
      b[inline.dataset.inlineProp]=inline.innerText.replace(/\u00a0/g,' ');worksheet.updatedAt=new Date().toISOString();scheduleSave();
      const field=$(`#settingsContent [data-prop="${inline.dataset.inlineProp}"]`);if(field&&selectedId===b.id)field.value=b[inline.dataset.inlineProp];
    });
    document.addEventListener('focusout', e => {
      const inline=e.target.closest('[data-inline-prop]');if(inline&&!$('#previewOverlay').contains(inline))setTimeout(()=>renderWorkspace(),0);
    },true);
    $('#modalBody').addEventListener('change', e => { if(e.target.id==='importJsonFile'&&e.target.files[0])importWorksheetJson(e.target.files[0]); });
    window.addEventListener('afterprint',()=>document.body.classList.remove('print-landscape'));
  }

  function handleClick(e) {
    const start=e.target.closest('[data-start]'); if(start){ const a=start.dataset.start; if(a==='new') openPresetDialog(); if(a==='continue'){const d=read(STORAGE.draft,null);d?openEditor(d):openPresetDialog();} if(a==='templates') openLibraryDialog(true); return; }
    const preset=e.target.closest('[data-preset]'); if(preset){ createFromPreset(preset.dataset.preset); return; }
    const part=e.target.closest('[data-add-part]'); if(part){ addBlock(part.dataset.addPart); return; }
    const set=e.target.closest('[data-set]'); if(set){ addSet(set.dataset.set); return; }
    const block=e.target.closest('.block[data-id]');
    const action=e.target.closest('[data-action]');
    if(action && block){ e.stopPropagation(); blockAction(block.dataset.id,action.dataset.action); return; }
    if(block && !$('#previewOverlay').contains(block)){
      const inlineTarget=e.target.closest('[data-inline-prop],[data-table-cell]');
      if(selectedId!==block.dataset.id){selectedId=block.dataset.id;$('#pages').querySelectorAll('.block').forEach(x=>x.classList.toggle('selected',x.dataset.id===selectedId));renderSettings();}
      if(!inlineTarget)switchMobilePanel('settings');
      return;
    }
    const prop=e.target.closest('[data-setprop]'); if(prop){ setBlockProp(prop.dataset.setprop,parseValue(prop.dataset.value)); return; }
    const nav=e.target.closest('[data-navi]'); if(nav){ setBlockProp('imageUrl',nav.dataset.navi); return; }
    const h=e.target.closest('[data-height]'); if(h){ const b=getSelected(); if(b){ commit(); b.height=Math.max(6,(b.height||30)+Number(h.dataset.height)); changed(); } return; }
    const mode=e.target.closest('[data-mode]'); if(mode){ displayMode=mode.dataset.mode; $$('.mode-switch button').forEach(x=>x.classList.toggle('active',x===mode)); renderWorkspace(); return; }
    const tab=e.target.closest('[data-panel]'); if(tab){ switchMobilePanel(tab.dataset.panel); return; }
    const cell=e.target.closest('[data-use-doc]'); if(cell){ useSaved(cell.dataset.useDoc,cell.dataset.kind); return; }
    const del=e.target.closest('[data-delete-saved]'); if(del){ deleteSaved(del.dataset.deleteSaved,del.dataset.kind); return; }
    if(e.target.id==='modalClose'||e.target=== $('#modal')) closeModal();
    if(e.target.id==='homeBtn'){ showStart(); }
    if(e.target.id==='newBtn'){ openPresetDialog(); }
    if(e.target.id==='saveBtn'){ openSaveDialog(); }
    if(e.target.id==='templatesBtn'){ openLibraryDialog(false); }
    if(e.target.id==='dataBtn'){ openDataDialog(); }
    if(e.target.id==='undoBtn') undo(); if(e.target.id==='redoBtn') redo();
    if(e.target.id==='paperSettingsBtn') openPaperSettings();
    if(e.target.id==='previewBtn') openPreview(); if(e.target.id==='closePreview') closePreview();
    if(e.target.id==='printBtn'||e.target.id==='previewPrint') printWorksheet();
    if(e.target.id==='zoomOut') setZoom(zoom-.1); if(e.target.id==='zoomIn') setZoom(zoom+.1);
    if(e.target.id==='saveDocumentAction') saveNamed('document'); if(e.target.id==='saveTemplateAction') saveNamed('template');
    if(e.target.id==='applyPaperSettings') applyPaperSettings();
    if(e.target.id==='exportDataAction') exportWorksheetJson();
  }

  function renderParts(){ $('#partsList').innerHTML=PARTS.map(([id,label,icon])=>`<button class="part-button" data-add-part="${id}"><span>${icon}</span>${label}</button>`).join(''); }

  function createFromPreset(id){
    const p=PRESETS.find(x=>x.id===id); if(!p)return;
    let w=newWorksheet(p.subject,p.writingMode||'horizontal'); w.title=p.name==='自由'?'学習プリント':`${p.name}プリント`; w.name=w.title; w=p.build(w);
    closeModal(); openEditor(w); toast(`${p.name}のひな形を開きました`);
  }

  function openEditor(data){worksheet=clone(data);migrateWorksheet(worksheet);selectedId=null;history=[];future=[];$('#startScreen').classList.add('hidden');$('#editor').classList.remove('hidden');location.hash='edit';renderWorkspace();scheduleSave();}
  function migrateWorksheet(w){if(!Array.isArray(w.blocks))w.blocks=[];w.blocks.forEach(b=>{if(b.type==='navi'&&Number(b.width)===100&&Number(b.height||40)===40&&b.alignment==='right'){b.width=33;b.height=32;}});return w;}
  function showStart(){ $('#editor').classList.add('hidden');$('#startScreen').classList.remove('hidden');location.hash='';const d=read(STORAGE.draft,null);$('#draftInfo').textContent=d?`${d.name||d.title}（${formatDate(d.updatedAt)}）`:'まだ自動保存はありません'; }

  function renderWorkspace(){
    if(!worksheet)return;
    const sub=SUBJECTS[worksheet.subject]||SUBJECTS.other;
    document.documentElement.style.setProperty('--subject',sub.color);
    document.documentElement.style.setProperty('--page-w',worksheet.orientation==='landscape'?'297mm':'210mm');
    document.documentElement.style.setProperty('--page-h',worksheet.orientation==='landscape'?'210mm':'297mm');
    document.documentElement.style.setProperty('--page-pad',({narrow:9,standard:14,wide:20}[worksheet.margin]||14)+'mm');
    document.documentElement.style.setProperty('--zoom',zoom);
    document.documentElement.style.setProperty('--base-font',({small:9.5,standard:10.5,large:12}[worksheet.fontSize]||10.5)+'pt');
    document.documentElement.style.setProperty('--base-leading',({narrow:1.35,standard:1.55,wide:1.8}[worksheet.lineHeight]||1.55));
    $('#documentName').textContent=worksheet.name||worksheet.title||'無題のプリント';
    renderPagesInto($('#pages'),true);
    renderSettings(); updateUndoButtons();
  }

  function renderPagesInto(container, editing){
    const pages=paginate();
    container.classList.toggle('editing',editing);
    container.innerHTML=pages.map((rows,i)=>`<div class="page-wrap"><div class="page-label">${i+1} / ${pages.length}ページ</div><article class="page ${worksheet.orientation} ${worksheet.writingMode==='vertical'?'vertical-root':''}"><div class="page-content">${i===0?renderHeader():''}${rows.map(row=>`<div class="page-row ${row.length===1&&row[0].type==='navi'?`navi-only align-${row[0].alignment||'right'}`:''}">${row.map(renderBlock).join('')}</div>`).join('')}</div></article></div>`).join('');
    if(!editing)container.querySelectorAll('[contenteditable]').forEach(x=>x.contentEditable='false');
    requestAnimationFrame(()=>correctRenderedPagination(container,editing));
    $('#pageCount').textContent=`${pages.length}ページ`;
  }

  function correctRenderedPagination(container,editing){
    // Measure at true A4 scale; the editor and preview apply CSS zoom for display only.
    const measuredPages=[...container.querySelectorAll('.page')];
    measuredPages.forEach(page=>page.style.zoom='1');
    const makePage=()=>{
      const wrap=document.createElement('div');
      wrap.className='page-wrap';
      wrap.innerHTML=`<div class="page-label"></div><article class="page ${worksheet.orientation} ${worksheet.writingMode==='vertical'?'vertical-root':''}"><div class="page-content"></div></article>`;
      wrap.querySelector('.page').style.zoom='1';
      return wrap;
    };
    let wraps=[...container.querySelectorAll('.page-wrap')],guard=0;
    for(let i=0;i<wraps.length&&guard<200;i++){
      const wrap=wraps[i],content=wrap.querySelector('.page-content');
      while(content.scrollHeight>content.clientHeight+2&&guard++<200){
        const rows=[...content.querySelectorAll(':scope > .page-row')],last=rows[rows.length-1];
        if(!last)break;
        const header=content.querySelector('.worksheet-header');
        const headerHeight=header?header.getBoundingClientRect().height+3:0;
        if(rows.length===1&&last.getBoundingClientRect().height+headerHeight>content.clientHeight+2)break;
        let next=wraps[i+1];
        if(!next){next=makePage();wrap.after(next);wraps.splice(i+1,0,next);}
        const nextContent=next.querySelector('.page-content'),firstRow=nextContent.querySelector(':scope > .page-row');
        nextContent.insertBefore(last,firstRow);
      }
    }
    wraps=[...container.querySelectorAll('.page-wrap')];
    wraps.forEach((wrap,i)=>{
      const label=wrap.querySelector('.page-label'),content=wrap.querySelector('.page-content');
      label.textContent=`${i+1} / ${wraps.length}ページ`;
      const overflow=content.scrollHeight>content.clientHeight+2;
      label.classList.toggle('warning',editing&&overflow);
      if(editing&&overflow)label.textContent+='・パーツが大きすぎます';
    });
    $('#pageCount').textContent=`${wraps.length}ページ`;
    container.querySelectorAll('.page').forEach(page=>page.style.removeProperty('zoom'));
  }

  function renderHeader(){
    const info=[];
    if(worksheet.showDate) info.push(`日付 <span class="fill">${esc(worksheet.date)}</span>`);
    if(worksheet.showGrade) info.push(`<span class="fill">${esc(worksheet.grade)}</span>年`);
    if(worksheet.showClass) info.push(`<span class="fill">${esc(worksheet.className)}</span>組`);
    if(worksheet.showName) info.push(`名前 <span class="fill name-fill"></span>`);
    return `<header class="worksheet-header"><div class="worksheet-title-row"><div><div class="worksheet-title">${esc(worksheet.title)}</div>${worksheet.subtitle?`<div class="worksheet-subtitle">${esc(worksheet.subtitle)}</div>`:''}</div></div>${info.length?`<div class="student-info">${info.join('　')}</div>`:''}</header>`;
  }

  function paginate(){
    const pageH=worksheet.orientation==='landscape'?210:297, pad={narrow:9,standard:14,wide:20}[worksheet.margin]||14;
    const titleLines=Math.max(1,Math.ceil(String(worksheet.title||'').length/20));
    const subtitleLines=worksheet.subtitle?Math.max(1,Math.ceil(String(worksheet.subtitle).length/36)):0;
    const headerHeight=30+(titleLines-1)*12+Math.max(0,subtitleLines-1)*5;
    const firstCapacity=pageH-pad*2-headerHeight, nextCapacity=pageH-pad*2;
    const rows=[]; let row=[],used=0;
    worksheet.blocks.forEach((b,i)=>{ const w=Number(b.width)||100; if(row.length && used+w>101){rows.push(row);row=[];used=0;} row.push(b);used+=w;if(used>=99){rows.push(row);row=[];used=0;} if(i===worksheet.blocks.length-1&&row.length)rows.push(row); });
    const pages=[[]]; let pageIndex=0, usedH=0;
    rows.forEach(row=>{
      const h=Math.max(...row.map(estimateHeight))+3;
      let cap=pageIndex===0?firstCapacity:nextCapacity;
      let gap=pages[pageIndex].length?3:0;
      if(usedH+gap+h>cap&&pages[pageIndex].length){pages.push([]);pageIndex++;usedH=0;cap=nextCapacity;gap=0;}
      usedH+=gap;
      pages[pageIndex].push(row);
      usedH+=h;
    });
    return pages;
  }

  function estimateHeight(b){
    const chars=String(b.content||'').length, width=Math.max(.25,(Number(b.width)||100)/100), writing=resolvedWriting(b);
    if(['ruled','calc','grid','image','navi','reflection','answerline'].includes(b.type)) return Math.max(6,Number(b.height)||30);
    if(b.type==='table')return Math.max(1,Number(b.rows)||3)*10+4;
    if(b.type==='kanji'){const rows=Math.max(1,Number(b.rows)||2),size={small:10,medium:14,large:18}[b.cellSize]||14;return rows*size+(rows-1)*1.2+3;}
    if(b.type==='choice')return Math.max(22,12+Math.ceil(chars/(55*width))*7+Math.ceil((b.choices||[]).length/2)*8);
    if(b.type==='question')return Math.max(14,Math.ceil(chars/(55*width))*7+7+(displayMode==='teacher'&&b.answer?10:0));
    if(b.type==='heading')return Math.max(12,Math.ceil(chars/(22*width))*9+3);
    if(b.type==='goal'||b.type==='summary')return Math.max(18,Math.ceil(chars/(45*width))*7+6);
    if(b.type==='score')return 14;
    if(writing==='vertical')return Math.max(28,Math.ceil(chars/15)*9);
    return Math.max(14,Math.ceil(chars/(55*width))*7+7);
  }

  function resolvedWriting(b){return b.writingMode==='horizontal'?'horizontal':b.writingMode==='vertical'?'vertical':worksheet.writingMode;}
  function blockClasses(b){return `block block-${b.type} ${selectedId===b.id?'selected':''} ${resolvedWriting(b)==='vertical'?'writing-vertical vertical-auto':'writing-horizontal'} ${b.background?'has-bg':''} ${b.frame?'has-frame':''}`;}
  function actionBar(){return `<div class="block-actions"><button data-action="up" title="上へ">↑</button><button data-action="down" title="下へ">↓</button><button data-action="duplicate" title="複製">⧉</button><button data-action="delete" title="削除">×</button></div>`;}
  function renderBlock(b,index){
    const style=`width:calc(${Number(b.width)||100}% - 1.5mm);--block-h:${Number(b.height)||30}mm;--line-gap:${Number(b.lineGap)||8}mm;--align:${b.alignment||'left'};text-align:${b.alignment||'left'}`;
    let body=''; const qNum=b.numbered?`<span class="q-number">${questionNumber(b.id)}.</span>`:'';
    if(b.type==='heading') body=`<div class="content inline-edit" contenteditable="plaintext-only" data-inline-prop="content" style="font-size:${b.fontSize||15}pt;font-weight:${b.bold===false?400:800}">${nl(b.content)}</div>`;
    if(b.type==='text') body=`<div class="content inline-edit" contenteditable="plaintext-only" data-inline-prop="content" style="font-size:${b.fontSize||10.5}pt;line-height:${b.lineHeight||1.65}">${nl(b.content)}</div>`;
    if(b.type==='goal'||b.type==='summary') body=`<div class="goal-box"><span class="goal-label">${b.type==='goal'?'めあて':'まとめ'}</span><div class="content inline-edit" contenteditable="plaintext-only" data-inline-prop="content">${nl(b.content)}</div></div>`;
    if(b.type==='question') body=`<div class="block-question">${qNum}<div style="flex:1"><div class="content inline-edit" contenteditable="plaintext-only" data-inline-prop="content">${nl(b.content)}</div>${displayMode==='teacher'&&b.answer?`<div class="answer-display">答　${nl(b.answer)}</div>`:''}</div></div>`;
    if(b.type==='answerline') body='<div class="answer-line"></div>';
    if(b.type==='ruled') { const gap=Math.max(3,Number(b.lineGap)||8), count=Math.max(1,Math.floor((Number(b.height)||35)/gap)); body=`<div class="ruled-area ${b.lines===false?'no-lines':''}" style="--line-gap:${gap}mm">${b.lines===false?'':Array.from({length:count},()=>'<span class="ruled-line" aria-hidden="true"></span>').join('')}</div>`; }
    if(b.type==='calc') {
      const pattern=b.pattern||'blank', height=Math.max(6,Number(b.height)||40);
      if(pattern==='lines') { const count=Math.max(1,Math.floor(height/8)); body=`<div class="calc-area lines">${Array.from({length:count},()=>'<span class="calc-line" aria-hidden="true"></span>').join('')}</div>`; }
      else if(pattern==='grid') body=`<div class="calc-area grid"><svg class="print-grid-svg" aria-hidden="true"><defs><pattern id="calc-grid-${b.id}" width="18.8976" height="18.8976" patternUnits="userSpaceOnUse"><path d="M 18.8976 0 L 0 0 0 18.8976" fill="none" stroke="#777" stroke-width=".3mm"/></pattern></defs><rect width="100%" height="100%" fill="url(#calc-grid-${b.id})"/></svg></div>`;
      else body='<div class="calc-area blank"></div>';
    }
    if(b.type==='grid') body=`<div class="grid-area"><svg class="print-grid-svg" aria-hidden="true"><defs><pattern id="grid-${b.id}" width="18.8976" height="18.8976" patternUnits="userSpaceOnUse"><path d="M 18.8976 0 L 0 0 0 18.8976" fill="none" stroke="#777" stroke-width=".3mm"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid-${b.id})"/></svg></div>`;
    if(b.type==='kanji'){const size={small:10,medium:14,large:18}[b.cellSize]||14;const total=Math.max(1,Math.min(80,(b.rows||2)*(b.cols||8)));body=`<div class="kanji-practice-grid" style="--kanji-cols:${Math.max(1,Math.min(16,b.cols||8))};--kanji-size:${size}mm">${Array.from({length:total},(_,i)=>`<span class="kanji-cell ${i===0&&b.sample?'sample':''}">${i===0&&b.sample?esc(b.sample):''}</span>`).join('')}</div>`;}
    if(b.type==='choice'){const marks=b.marker==='number'?['①','②','③','④','⑤','⑥']:['ア','イ','ウ','エ','オ','カ'];body=`<div class="block-question">${qNum}<div style="flex:1"><div class="content inline-edit" contenteditable="plaintext-only" data-inline-prop="content">${nl(b.content)}</div><div class="choices">${(b.choices||[]).map((x,i)=>`<div><span class="choice-mark">${marks[i]}</span>${nl(x)}</div>`).join('')}</div>${displayMode==='teacher'&&b.answer?`<div class="answer-display">答　${nl(b.answer)}</div>`:''}</div></div>`;}
    if(b.type==='table'){body=`<table class="worksheet-table"><tbody>${Array.from({length:b.rows||2},(_,r)=>`<tr>${Array.from({length:b.cols||2},(_,c)=>{const i=r*(b.cols||2)+c;return `<td contenteditable="true" data-table-cell="${i}">${nl((b.cells||[])[i]||'')}</td>`}).join('')}</tr>`).join('')}</tbody></table>`;}
    if(b.type==='image'||b.type==='navi') body=b.imageUrl?`<img src="${esc(b.imageUrl)}" alt="${b.type==='navi'?'学習イラスト':'挿入画像'}">`:'<div class="placeholder-image">画像を選んでください</div>';
    if(b.type==='reflection') { const gap=Math.max(3,Number(b.lineGap)||8), count=Math.max(1,Math.floor(Math.max(8,(Number(b.height)||30)-10)/gap)); body=`<div class="reflection-heading">ふりかえり</div><div class="reflection-label inline-edit" contenteditable="plaintext-only" data-inline-prop="content">${nl(b.content)}</div><div class="ruled-area ${b.lines===false?'no-lines':''}" style="--line-gap:${gap}mm">${b.lines===false?'':Array.from({length:count},()=>'<span class="ruled-line" aria-hidden="true"></span>').join('')}</div>`; }
    if(b.type==='score') body=`<div class="score-line">${esc(b.content||'得点')}　　／ ${Number(b.total)||100} 点</div>`;
    return `<section class="${blockClasses(b)}" style="${style}" data-id="${b.id}">${actionBar()}${body}</section>`;
  }

  function questionNumber(id){return worksheet.blocks.filter(b=>b.type==='question'||b.type==='choice').findIndex(b=>b.id===id)+1;}
  function getSelected(){return worksheet?.blocks.find(b=>b.id===selectedId);}

  function addBlock(type){ if(!worksheet)return;commit();const b=makeBlock(type);worksheet.blocks.push(b);selectedId=b.id;changed();setTimeout(()=>document.querySelector(`[data-id="${b.id}"]`)?.scrollIntoView({behavior:'smooth',block:'center'}),30); }
  function addSet(set){commit();const lists={written:[['question',{}],['ruled',{height:40}]],math:[['question',{}],['calc',{height:38}],['answerline',{height:9}]],reflection:[['reflection',{content:'わかったこと',height:30}],['reflection',{content:'次にがんばること',height:24}]]};const made=(lists[set]||[]).map(([t,o])=>makeBlock(t,o));worksheet.blocks.push(...made);selectedId=made[0]?.id;changed();}
  function blockAction(id,action){const i=worksheet.blocks.findIndex(b=>b.id===id);if(i<0)return;commit();if(action==='up'&&i>0)[worksheet.blocks[i-1],worksheet.blocks[i]]=[worksheet.blocks[i],worksheet.blocks[i-1]];if(action==='down'&&i<worksheet.blocks.length-1)[worksheet.blocks[i+1],worksheet.blocks[i]]=[worksheet.blocks[i],worksheet.blocks[i+1]];if(action==='duplicate'){const c=clone(worksheet.blocks[i]);c.id=uid();worksheet.blocks.splice(i+1,0,c);selectedId=c.id;}if(action==='delete'){worksheet.blocks.splice(i,1);selectedId=worksheet.blocks[Math.min(i,worksheet.blocks.length-1)]?.id||null;}changed();}

  function renderSettings(){
    const root=$('#settingsContent'),b=getSelected(); if(!b){root.innerHTML=$('#emptySettings').innerHTML;return;}
    const label=PARTS.find(x=>x[0]===b.type)?.[1]||b.type;
    let html=`<div class="settings-section"><h3>${label}</h3>`;
    if(['heading','text','goal','question','choice','summary','reflection','score'].includes(b.type)) html+=field('文章','content',b.content,'textarea');
    if(['question','choice'].includes(b.type)) html+=field('解答（先生用に表示）','answer',b.answer||'','textarea');
    if(b.type==='heading') html+=field('文字サイズ','fontSize',b.fontSize||15,'number')+segment('太字','bold',b.bold!==false,[['true','あり'],['false','なし']])+segment('背景','background',!!b.background,[['true','あり'],['false','なし']]);
    if(b.type==='text') html+=field('文字サイズ（pt）','fontSize',b.fontSize||10.5,'number')+field('行間','lineHeight',b.lineHeight||1.65,'number')+segment('枠','frame',!!b.frame,[['true','あり'],['false','なし']]);
    if(['question','choice'].includes(b.type)) html+=segment('問題番号','numbered',b.numbered!==false,[['true','あり'],['false','なし']]);
    if(b.type==='choice') html+=choiceSettings(b);
    if(b.type==='kanji') html+=field('見本（1マス目に薄く表示）','sample',b.sample||'')+`<div class="inline-fields">${field('行','rows',b.rows||2,'number')}${field('列','cols',b.cols||8,'number')}</div>`+segment('マスの大きさ','cellSize',b.cellSize||'medium',[['small','小'],['medium','中'],['large','大']]);
    if(['ruled','calc','grid','image','navi','reflection','answerline'].includes(b.type)) html+=heightControl(b);
    if(b.type==='ruled'||b.type==='reflection') html+=segment('罫線','lines',b.lines!==false,[['true','あり'],['false','なし']])+field('行の間隔（mm）','lineGap',b.lineGap||8,'number');
    if(b.type==='calc') html+=segment('計算欄','pattern',b.pattern||'blank',[['blank','白紙'],['lines','横罫'],['grid','方眼']]);
    if(b.type==='image') html+=`<label class="field"><span>端末から画像を選ぶ</span><input id="imageFile" type="file" accept="image/*"></label>`;
    if(b.type==='navi') html+=naviSettings(b);
    if(b.type==='table') html+=tableSettings(b);
    if(b.type==='score') html+=field('満点','total',b.total||100,'number');
    html+='</div><div class="settings-section">'+segment('横幅','width',Number(b.width)||100,[['100','100%'],['66','66%'],['50','50%'],['33','33%']]);
    if(!['table','calc','grid','answerline'].includes(b.type))html+=segment('配置','alignment',b.alignment||'left',[['left','左'],['center','中央'],['right','右']]);
    html+=segment('文字方向','writingMode',b.writingMode||'auto',[['auto','自動'],['horizontal','横'],['vertical','縦']]);
    html+=`</div><button class="danger-btn">このパーツを削除</button>`;
    root.innerHTML=html;
    const danger=root.querySelector('.danger-btn');danger.onclick=()=>blockAction(b.id,'delete');
  }

  function field(label,prop,value,type='text'){return `<label class="field"><span>${label}</span>${type==='textarea'?`<textarea data-prop="${prop}">${esc(value)}</textarea>`:`<input data-prop="${prop}" type="${type}" value="${esc(value)}" ${type==='number'?'step="0.5"':''}>`}</label>`;}
  function segment(label,prop,current,options){return `<div class="field"><span>${label}</span><div class="segmented">${options.map(([v,l])=>`<button data-setprop="${prop}" data-value="${v}" class="${String(current)===String(parseValue(v))?'active':''}">${l}</button>`).join('')}</div></div>`;}
  function heightControl(b){return `<div class="field"><span>高さ（${b.height||30}mm）</span><div class="segmented"><button data-height="-5">−</button><button data-setprop="height" data-value="20">小</button><button data-setprop="height" data-value="35">中</button><button data-setprop="height" data-value="55">大</button><button data-height="5">＋</button></div></div>`;}
  function choiceSettings(b){return `<div class="field"><span>選択肢（2〜6個）</span>${(b.choices||[]).map((x,i)=>`<input data-choice="${i}" value="${esc(x)}" style="margin-bottom:4px">`).join('')}<div class="segmented"><button data-choice-action="remove">− 1個</button><button data-choice-action="add">＋ 1個</button></div></div>${segment('記号','marker',b.marker||'kana',[['kana','アイウ'],['number','①②③']])}`;}
  function tableSettings(b){return `<div class="inline-fields">${field('行','rows',b.rows||3,'number')}${field('列','cols',b.cols||3,'number')}</div><div class="field"><span>セルの内容</span><div class="table-editor" style="grid-template-columns:repeat(${b.cols||3},1fr)">${(b.cells||[]).map((x,i)=>`<input data-cell="${i}" value="${esc(x)}" aria-label="セル${i+1}">`).join('')}</div></div>`;}
  function naviSettings(b){return `<div class="field"><span>NAVIイラスト</span><div class="navi-grid">${NAVI.map(([label,file])=>{const url=NAVI_BASE+file;return `<button class="navi-choice ${b.imageUrl===url?'active':''}" data-navi="${url}"><img src="${url}" alt=""><small>${label}</small></button>`}).join('')}</div></div>`;}

  function handleSettingsInput(e){
    const b=getSelected();if(!b)return;
    if(e.target.dataset.prop){ if(!e.target.dataset.started){commit();e.target.dataset.started='1';} b[e.target.dataset.prop]=parseValue(e.target.value); changed(false); }
    if(e.target.dataset.choice){if(!e.target.dataset.started){commit();e.target.dataset.started='1';}b.choices[Number(e.target.dataset.choice)]=e.target.value;changed(false);}
    if(e.target.dataset.cell){if(!e.target.dataset.started){commit();e.target.dataset.started='1';}b.cells[Number(e.target.dataset.cell)]=e.target.value;changed(false);}
  }
  async function handleSettingsChange(e){
    const b=getSelected();if(!b)return;
    if(e.target.id==='imageFile'&&e.target.files[0]){
      const file=e.target.files[0];if(file.size>15*1024*1024){toast('画像は15MB以下にしてください');return;}
      const blockId=b.id;toast('画像を読み込んでいます…');
      try{const imageUrl=await imageToDataUrl(file);const target=worksheet.blocks.find(x=>x.id===blockId);if(!target)return;commit();target.imageUrl=imageUrl;changed();toast('画像を用紙向けに軽量化しました');}catch{toast('画像を読み込めませんでした');}
    }
    if(e.target.dataset.prop==='rows'||e.target.dataset.prop==='cols'){if(b.type==='table')resizeTable(b);if(b.type==='kanji')resizeKanji(b);changed();}
  }
  $('#settingsContent').addEventListener('click',e=>{const b=getSelected();if(!b)return;const a=e.target.dataset.choiceAction;if(a){commit();if(a==='add'&&b.choices.length<6)b.choices.push(`選択肢${b.choices.length+1}`);if(a==='remove'&&b.choices.length>2)b.choices.pop();changed();}});
  function resizeTable(b){b.rows=Math.max(1,Math.min(10,Number(b.rows)||1));b.cols=Math.max(1,Math.min(8,Number(b.cols)||1));const old=b.cells||[];b.cells=Array.from({length:b.rows*b.cols},(_,i)=>old[i]||'');}
  function resizeKanji(b){b.rows=Math.max(1,Math.min(8,Number(b.rows)||1));b.cols=Math.max(1,Math.min(16,Number(b.cols)||1));}
  function setBlockProp(prop,value){const b=getSelected();if(!b)return;commit();b[prop]=value;if((prop==='rows'||prop==='cols')&&b.type==='table')resizeTable(b);if((prop==='rows'||prop==='cols')&&b.type==='kanji')resizeKanji(b);changed();}
  function parseValue(v){if(v==='true')return true;if(v==='false')return false;if(v!==''&&!Number.isNaN(Number(v)))return Number(v);return v;}

  function imageToDataUrl(file){
    return new Promise((resolve,reject)=>{const img=new Image(),url=URL.createObjectURL(file);img.onload=()=>{try{const max=1600,scale=Math.min(1,max/Math.max(img.naturalWidth,img.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(url);resolve(canvas.toDataURL('image/webp',.84));}catch(err){URL.revokeObjectURL(url);reject(err);}};img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('image'));};img.src=url;});
  }

  function commit(){ if(!worksheet)return;history.push(JSON.stringify(worksheet));if(history.length>30)history.shift();future=[]; }
  function undo(){if(!history.length)return;future.push(JSON.stringify(worksheet));worksheet=JSON.parse(history.pop());selectedId=worksheet.blocks.some(b=>b.id===selectedId)?selectedId:null;changed();}
  function redo(){if(!future.length)return;history.push(JSON.stringify(worksheet));worksheet=JSON.parse(future.pop());selectedId=worksheet.blocks.some(b=>b.id===selectedId)?selectedId:null;changed();}
  function updateUndoButtons(){$('#undoBtn').disabled=!history.length;$('#redoBtn').disabled=!future.length;}
  function changed(full=true){worksheet.updatedAt=new Date().toISOString();scheduleSave();if(full)renderWorkspace();else{renderPagesInto($('#pages'),true);$('#saveStatus').textContent='保存中…';}}
  function scheduleSave(){clearTimeout(saveTimer);$('#saveStatus').textContent='保存中…';saveTimer=setTimeout(()=>{try{write(STORAGE.draft,worksheet);$('#saveStatus').textContent='保存しました';}catch{toast('保存容量がいっぱいです。大きな画像を減らしてください');$('#saveStatus').textContent='保存できません';}},450);}

  function openPresetDialog(){openModal('新しいプリント','ひな形を選ぶ',`<div class="template-grid">${PRESETS.map(p=>`<button class="template-card" data-preset="${p.id}"><span>${p.icon}</span><b>${p.name}</b><small>${p.desc}</small></button>`).join('')}</div>`);}
  function openSaveDialog(){openModal('保存','あとで使えるように残す',`<label class="field"><span>プリント名</span><input id="saveName" value="${esc(worksheet.name||worksheet.title)}"></label><p class="panel-help">「プリントとして保存」は内容も残します。「テンプレート」はコピーを作るためのひな形として保存します。</p><div class="form-actions"><button id="saveTemplateAction">テンプレートとして保存</button><button id="saveDocumentAction" class="accent">プリントとして保存</button></div>`);setTimeout(()=>$('#saveName')?.select(),0);}
  function saveNamed(kind){
    const name=$('#saveName').value.trim()||worksheet.title||'無題のプリント';
    const key=kind==='template'?STORAGE.templates:STORAGE.documents;
    const stored=read(key,[]),items=Array.isArray(stored)?stored:[],saved=clone(worksheet);
    saved.id=uid();saved.name=name;saved.updatedAt=new Date().toISOString();
    items.unshift(saved);
    try{
      writeMany([[key,items.slice(0,40)],[STORAGE.draft,{...worksheet,name,updatedAt:saved.updatedAt}]]);
      worksheet.name=name;worksheet.updatedAt=saved.updatedAt;
      closeModal();renderWorkspace();
      toast(kind==='template'?'テンプレートに保存しました':'プリントを保存しました');
    }catch{toast('保存容量がいっぱいです。画像を減らすか、JSONに書き出してください');}
  }
  function writeMany(entries){
    const previous=entries.map(([key])=>[key,localStorage.getItem(key)]);
    try{entries.forEach(([key,value])=>write(key,value));}
    catch(error){
      for(const [key,value] of previous){try{if(value===null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch{}}
      throw error;
    }
  }
  function openLibraryDialog(fromStart){const rawDocs=read(STORAGE.documents,[]),rawTemps=read(STORAGE.templates,[]),docs=Array.isArray(rawDocs)?rawDocs:[],temps=Array.isArray(rawTemps)?rawTemps:[];const rows=(items,kind)=>items.length?items.map(x=>`<div class="template-row"><div><b>${esc(x.name||x.title)}</b><small>${SUBJECTS[x.subject]?.label||'その他'}・${x.orientation==='landscape'?'A4横':'A4縦'}・${formatDate(x.updatedAt)}</small></div><button class="use" data-use-doc="${x.id}" data-kind="${kind}">コピーして作る</button><button data-delete-saved="${x.id}" data-kind="${kind}">削除</button></div>`).join(''):'<p class="panel-help">まだ保存されていません。</p>';openModal('マイテンプレート','保存した形から作る',`<h3>マイテンプレート</h3><div class="template-list">${rows(temps,'template')}</div><h3 style="margin-top:24px">保存したプリント</h3><div class="template-list">${rows(docs,'document')}</div>`);}
  function useSaved(id,kind){const stored=read(kind==='template'?STORAGE.templates:STORAGE.documents,[]),items=Array.isArray(stored)?stored:[],src=items.find(x=>x.id===id);if(!src)return;const w=clone(src);w.id=uid();w.name=`${src.name} のコピー`;w.createdAt=w.updatedAt=new Date().toISOString();closeModal();openEditor(w);toast('コピーを作りました');}
  function deleteSaved(id,kind){const key=kind==='template'?STORAGE.templates:STORAGE.documents,stored=read(key,[]),items=Array.isArray(stored)?stored:[],item=items.find(x=>x.id===id);if(!item||!confirm(`「${item.name||item.title}」を削除しますか？`))return;try{write(key,items.filter(x=>x.id!==id));openLibraryDialog(false);toast('削除しました');}catch{toast('削除内容を保存できませんでした。空き容量を確認してください');}}

  function openDataDialog(){openModal('データの入出力','バックアップ・AIとの受け渡し',`<div class="data-cards"><section><b>JSONを書き出す</b><p>現在のプリントを、画像や設定を含めて1つのファイルに保存します。バックアップや、AIへ渡して編集するときに使えます。</p><button id="exportDataAction" class="data-action">JSONを書き出す</button></section><section><b>JSONを読み込む</b><p>プリント工房から書き出したデータや、同じ形式でAIが作成したデータを読み込みます。読み込むと編集中のプリントと自動保存データが置き換わるため、必要なら先にJSONを書き出してください。</p><label class="data-action file-action">JSONを選ぶ<input id="importJsonFile" type="file" accept="application/json,.json"></label></section></div><p class="data-tip">AIには「このJSONの構造を保ったまま、問題文やパーツ構成を変更してください」と伝えると安定します。</p>`);}
  function exportWorksheetJson(){const payload={format:'print-kobo',version:1,exportedAt:new Date().toISOString(),worksheet:clone(worksheet)},blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${safeFileName(worksheet.name||worksheet.title||'print')}.json`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('JSONを書き出しました');}
  function importWorksheetJson(file){
    if(file.size>12*1024*1024){toast('JSONファイルが大きすぎます');return;}
    if(worksheet&&!confirm('JSONを読み込むと、編集中のプリントと自動保存データが置き換わります。必要なら先にJSONを書き出してください。読み込みますか？'))return;
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const parsed=JSON.parse(reader.result);
        if(parsed?.format&&parsed.format!=='print-kobo')throw new Error('format');
        if(parsed?.format==='print-kobo'&&parsed.version!==1)throw new Error('version');
        const w=normalizeWorksheetData(parsed);
        closeModal();openEditor(w);toast('JSONからプリントを作りました');
      }catch{toast('プリント工房のJSONとして読み込めませんでした');}
    };
    reader.onerror=()=>toast('ファイルを読み込めませんでした');
    reader.readAsText(file);
  }
  function normalizeWorksheetData(raw){
    const src=raw?.worksheet||raw;
    if(!src||!Array.isArray(src.blocks))throw new Error('format');
    const valid=new Set(PARTS.map(x=>x[0]));
    const pick=(value,allowed,fallback)=>allowed.includes(value)?value:fallback;
    const bounded=(value,min,max,fallback)=>{const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;};
    const shortText=(value,max=2000)=>String(value??'').slice(0,max);
    const now=new Date().toISOString();
    const base=newWorksheet(pick(src.subject,Object.keys(SUBJECTS),'other'),pick(src.writingMode,['horizontal','vertical'],'horizontal'));
    const w={...base,...src,id:uid(),createdAt:now,updatedAt:now};
    w.name=shortText(src.name||src.title||'無題のプリント',120);
    w.title=shortText(src.title||'学習プリント',120);
    w.subtitle=shortText(src.subtitle,240);
    w.subject=pick(src.subject,Object.keys(SUBJECTS),'other');
    w.paperSize='A4';
    w.orientation=pick(src.orientation,['portrait','landscape'],'portrait');
    w.writingMode=pick(src.writingMode,['horizontal','vertical'],'horizontal');
    w.margin=pick(src.margin,['narrow','standard','wide'],'standard');
    w.fontSize=pick(src.fontSize,['small','standard','large'],'standard');
    w.lineHeight=pick(src.lineHeight,['narrow','standard','wide'],'standard');
    w.grade=shortText(src.grade,20);w.className=shortText(src.className,20);
    w.date=/^\d{4}-\d{2}-\d{2}$/.test(String(src.date||''))?src.date:'';
    for(const key of ['showGrade','showClass','showName','showDate'])w[key]=src[key]===true;
    const input=src.blocks.slice(0,200);
    w.blocks=input.filter(b=>b&&valid.has(b.type)).map(source=>{
      const b=makeBlock(source.type,{...source,id:uid()});
      b.content=shortText(b.content,10000);
      b.width=bounded(b.width,25,100,100);
      b.height=bounded(b.height,6,150,30);
      b.alignment=pick(b.alignment,['left','center','right'],'left');
      b.writingMode=pick(b.writingMode,['auto','horizontal','vertical'],'auto');
      b.lineHeight=bounded(b.lineHeight,.8,3,1.65);
      b.fontSize=bounded(b.fontSize,6,48,10.5);
      b.lineGap=bounded(b.lineGap,4,20,8);
      if('answer' in b)b.answer=shortText(b.answer,3000);
      if('sample' in b)b.sample=shortText(b.sample,200);
      for(const key of ['bold','background','frame','numbered','lines'])if(key in b)b[key]=b[key]===true;
      if('rows' in b)b.rows=Math.round(bounded(b.rows,1,b.type==='kanji'?8:10,b.type==='kanji'?2:3));
      if('cols' in b)b.cols=Math.round(bounded(b.cols,1,b.type==='kanji'?16:8,b.type==='kanji'?8:3));
      if(b.type==='table'){
        b.cells=Array.from({length:b.rows*b.cols},(_,i)=>shortText(Array.isArray(source.cells)?source.cells[i]:'',500));
      }
      if(b.type==='kanji')b.cellSize=pick(b.cellSize,['small','medium','large'],'medium');
      if(b.type==='calc')b.pattern=pick(b.pattern,['blank','lines','grid'],'blank');
      if(b.type==='choice'){
        b.marker=pick(b.marker,['kana','number','alpha'],'kana');
        b.choices=(Array.isArray(source.choices)?source.choices:[]).slice(0,6).map(v=>shortText(v,300));
        while(b.choices.length<2)b.choices.push('');
      }
      if(b.type==='image'||b.type==='navi'){
        const url=String(b.imageUrl||'');
        const isUploadedImage=b.type==='image'&&url.length<=6*1024*1024&&/^data:image\/(webp|png|jpeg);base64,/i.test(url);
        const isApprovedNavi=b.type==='navi'&&NAVI.some(item=>url===NAVI_BASE+item[1]);
        b.imageUrl=isUploadedImage||isApprovedNavi?url:'';
      }
      return b;
    });
    if(!w.blocks.length&&src.blocks.length)throw new Error('blocks');
    return w;
  }
  function safeFileName(name){return String(name).replace(/[\\/:*?"<>|]/g,'_').slice(0,60)||'print';}

  function openPaperSettings(){openModal('用紙と基本情報','プリント全体の設定',`<div class="inline-fields">${selectField('教科','paperSubject',worksheet.subject,Object.entries(SUBJECTS).map(([v,x])=>[v,x.label]))}${selectField('用紙の向き','paperOrientation',worksheet.orientation,[['portrait','A4縦'],['landscape','A4横']])}${selectField('文字方向','paperWriting',worksheet.writingMode,[['horizontal','横書き'],['vertical','縦書き']])}${selectField('余白','paperMargin',worksheet.margin,[['narrow','狭い'],['standard','標準'],['wide','広い']])}${selectField('基本文字','paperFont',worksheet.fontSize,[['small','小'],['standard','標準'],['large','大']])}${selectField('行間','paperLine',worksheet.lineHeight,[['narrow','狭い'],['standard','標準'],['wide','広い']])}</div><hr style="border:0;border-top:1px solid var(--line);margin:18px 0"><div class="inline-fields">${plainField('タイトル','paperTitle',worksheet.title)}${plainField('サブタイトル','paperSubtitle',worksheet.subtitle)}${plainField('学年','paperGrade',worksheet.grade)}${plainField('組','paperClass',worksheet.className)}${plainField('日付','paperDate',worksheet.date,'date')}</div><div class="field"><span>表示する欄</span><div class="segmented checks"><label><input id="showGrade" type="checkbox" ${worksheet.showGrade?'checked':''}> 学年</label><label><input id="showClass" type="checkbox" ${worksheet.showClass?'checked':''}> 組</label><label><input id="showName" type="checkbox" ${worksheet.showName?'checked':''}> 名前</label><label><input id="showDate" type="checkbox" ${worksheet.showDate?'checked':''}> 日付</label></div></div><div class="form-actions"><button id="applyPaperSettings" class="accent">設定を反映</button></div>`);}
  function selectField(label,id,current,options){return `<label class="field"><span>${label}</span><select id="${id}">${options.map(([v,l])=>`<option value="${v}" ${v===current?'selected':''}>${l}</option>`).join('')}</select></label>`;}
  function plainField(label,id,current,type='text'){return `<label class="field"><span>${label}</span><input id="${id}" type="${type}" value="${esc(current||'')}"></label>`;}
  function applyPaperSettings(){commit();Object.assign(worksheet,{subject:$('#paperSubject').value,orientation:$('#paperOrientation').value,writingMode:$('#paperWriting').value,margin:$('#paperMargin').value,fontSize:$('#paperFont').value,lineHeight:$('#paperLine').value,title:$('#paperTitle').value,subtitle:$('#paperSubtitle').value,grade:$('#paperGrade').value,className:$('#paperClass').value,date:$('#paperDate').value,showGrade:$('#showGrade').checked,showClass:$('#showClass').checked,showName:$('#showName').checked,showDate:$('#showDate').checked});if(!worksheet.name||worksheet.name==='無題のプリント')worksheet.name=worksheet.title;closeModal();changed();}

  function openPreview(){
    const overlay=$('#previewOverlay');
    overlay.classList.remove('hidden');
    renderPagesInto($('#previewPages'),false);
  }
  function closePreview(){$('#previewOverlay').classList.add('hidden');}
  function printWorksheet(){
    document.body.classList.toggle('print-landscape',worksheet.orientation==='landscape');
    let style=document.getElementById('printOrientationStyle');
    if(!style){style=document.createElement('style');style.id='printOrientationStyle';document.head.appendChild(style);}
    style.textContent=`@page{size:A4 ${worksheet.orientation==='landscape'?'landscape':'portrait'};margin:0}`;
    // Re-render from the current worksheet before printing so the printout uses the latest content.
    renderPagesInto($('#pages'),false);
    setTimeout(()=>window.print(),80);
  }
  function setZoom(v){zoom=Math.max(.4,Math.min(1.1,Math.round(v*10)/10));$('#zoomLabel').textContent=Math.round(zoom*100)+'%';document.documentElement.style.setProperty('--zoom',zoom);}
  function switchMobilePanel(name){const map={parts:'#partsPanel',canvas:'#canvasPanel',settings:'#settingsPanel'};$$('.mobile-tabs button').forEach(x=>x.classList.toggle('active',x.dataset.panel===name));$$('.workspace> *').forEach(x=>x.classList.remove('active'));$(map[name])?.classList.add('active');}
  function openModal(title,kicker,body){$('#modalTitle').textContent=title;$('#modalKicker').textContent=kicker;$('#modalBody').innerHTML=body;$('#modal').classList.remove('hidden');}
  function closeModal(){$('#modal').classList.add('hidden');}
  function toast(msg){clearTimeout(toastTimer);$('#toast').textContent=msg;$('#toast').classList.add('show');toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),1800);}
  function formatDate(s){if(!s)return'';const d=new Date(s);return `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;}

  init();
})();
