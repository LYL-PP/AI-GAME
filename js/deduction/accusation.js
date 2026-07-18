// accusation.js —— 真凶判定规则 + EndingAPI 钩子（结局系统占位）
// 规则：指认 wargrave 且证据含 clue_08/09/10 任意两条 = 证据达标（真结局条件）
// 软指认误判：softMarks 含非 wargrave 标记 → 隐藏结局条件失败（记录 flag）
const CHAIN_A = ['clue_08', 'clue_09', 'clue_10'];

export function evaluateAccusation(accusedId, evidenceIds, save) {
  const chainHits = CHAIN_A.filter((c) => evidenceIds.includes(c));
  const evidenceOk = accusedId === 'wargrave' && chainHits.length >= 2;
  // 软指认误判检查
  const softMarks = save?.data?.softMarks || {};
  const tainted = Object.keys(softMarks).some((id) => softMarks[id] && id !== 'wargrave');
  return {
    accusedId,
    evidenceIds: [...evidenceIds],
    chainA: chainHits,
    evidenceOk,                    // 真结局证据条件
    correct: accusedId === 'wargrave',
    softMarkTaint: tainted,        // 有非真凶软指认 → 隐藏结局失败
    hiddenOk: evidenceOk && !tainted,
    result: evidenceOk ? 'true' : 'wrong',
  };
}

export class AccusationSystem {
  constructor(save, ui, uiData) {
    this.save = save;
    this.ui = ui;
    this.uiData = uiData;
  }

  submit(accusedId, evidenceIds) {
    window.AudioAPI?.play?.('accuse_bass');
    const r = evaluateAccusation(accusedId, evidenceIds, this.save);
    // 写存档
    this.save.data.accusation = { accusedId, evidenceIds: [...evidenceIds], result: r.result };
    if (r.softMarkTaint) this.save.data.flags.hidden_failed = true;
    this.save.setFlag('accused', true);
    this.save.write();
    // 结局系统接管；未接管时退回临时确认提示
    if (window.EndingAPI?.submit) {
      window.EndingAPI.submit(r);
      return r;
    }
    const ad = this.uiData.accusation;
    if (r.evidenceOk) this.ui.toast(`${ad.confirm} ✓ —— ${r.accusedId}`);
    else this.ui.toast(ad.evidenceNeed);
    return r;
  }
}
