# -*- coding: utf-8 -*-
"""
從 sanguo-wiki 轉出遊戲武將表。
輸入:
  ../sanguo-wiki/scripts/characters.py  (正名->別名字典)
  ../sanguo-wiki/data/facts/ch_*.json   (逐回事實句, 用事實句總數當配角活躍度)
輸出:
  ../data/officers.json  (資料交換用)
  ../data/officers.js    (window.OFFICERS = [...], 供 file:// 直開 index.html)

主要武將 (~55 人) 用 KOEI 歷代共識值手工鎖定; 其餘由事實句數+確定性 hash 推導。
TODO(二期): 從 facts 抽「年份+人物+事件」候選表 events_draft.json (facts 無年份欄位, 需另外對回目->年份表)。
用法: python export_officers.py [wiki_root]
"""
import sys, os, json, glob, hashlib, math

HERE = os.path.dirname(os.path.abspath(__file__))
WIKI = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "..", "..", "sanguo-wiki")
OUT = os.path.join(HERE, "..", "data")

# ---- 排除名單: 皇帝/宦官/女眷/方士/先祖商人等非武將 wiki 人物 ----
EXCLUDE = {
    "桓帝", "靈帝", "漢獻帝", "竇武", "陳蕃",
    "曹節", "張讓", "趙忠", "封諝", "段珪", "侯覽", "蹇碩", "程曠", "夏惲", "郭勝", "黃皓",
    "貂蟬", "大喬", "小喬", "吳國太", "孫夫人",
    "南華老仙", "左慈", "于吉", "管輅", "華佗", "吉平",
    "曹嵩", "曹騰", "橋玄", "劉貞", "劉雄", "劉弘", "張世平", "蘇雙", "左豐",
    "何顒", "許劭", "鄭玄", "蔡邕", "唐周", "禰衡", "楊修",
}
# 禰衡/楊修/華佗 等名士暫排除(無法帶兵), 想加回來改這裡即可

# ---- 主要武將: (武, 智, 政, 魅, 義理, 生年, 卒年, face 覆蓋) ----
# face 覆蓋欄位: color/beard/hat/fab/cheek/old, 缺省走自動規則
M = {
    "劉備":   (73, 78, 80, 99, 90, 161, 223, {"color": "pink", "beard": 1}),
    "關羽":   (97, 75, 62, 93, 100, 160, 219, {"color": "red", "beard": 2, "hat": "scarf", "fab": ["#3E7A50", "#28543A"]}),
    "張飛":   (98, 45, 22, 45, 85, 166, 221, {"color": "black", "beard": 3, "hat": "topknot", "cheek": "butterfly"}),
    "諸葛亮": (35, 100, 98, 92, 95, 181, 234, {"color": "purple", "beard": 0, "hat": "scarf"}),
    "曹操":   (72, 96, 94, 96, 60, 155, 220, {"color": "white", "beard": 1}),
    "孫權":   (67, 85, 89, 95, 70, 182, 252, {"color": "yellow", "beard": 1}),
    "孫策":   (92, 80, 70, 92, 75, 175, 200, {"color": "red", "beard": 0}),
    "孫堅":   (90, 75, 70, 85, 80, 155, 191, {"color": "yellow", "beard": 1}),
    "周瑜":   (71, 96, 86, 93, 80, 175, 210, {"color": "purple", "beard": 0, "hat": "scarf"}),
    "魯肅":   (56, 92, 90, 82, 90, 172, 217, {"color": "white", "beard": 1}),
    "呂布":   (100, 26, 13, 40, 15, None, 198, {"color": "blue", "beard": 0, "hat": "helmet"}),
    "趙雲":   (96, 76, 65, 81, 95, None, 229, {"color": "red", "beard": 0, "hat": "helmet"}),
    "馬超":   (97, 45, 30, 70, 70, 176, 222, {"color": "blue", "beard": 0, "hat": "helmet"}),
    "黃忠":   (94, 60, 52, 60, 85, None, 220, {"color": "yellow", "beard": 2, "hat": "helmet", "old": True}),
    "魏延":   (92, 69, 40, 45, 40, None, 234, {"color": "blue", "beard": 1}),
    "姜維":   (89, 90, 70, 75, 90, 202, 264, {"color": "purple", "beard": 0, "hat": "helmet"}),
    "龐統":   (34, 97, 80, 60, 85, 179, 214, {"color": "white", "beard": 0, "hat": "scarf"}),
    "徐庶":   (60, 93, 75, 70, 90, None, None, {"color": "white", "beard": 0, "hat": "civil"}),
    "司馬懿": (63, 98, 93, 80, 30, 179, 251, {"color": "white", "beard": 1, "hat": "civil"}),
    "董卓":   (85, 70, 25, 40, 10, None, 192, {"color": "white", "beard": 3}),
    "袁紹":   (75, 70, 60, 85, 50, None, 202, {"color": "yellow", "beard": 1}),
    "袁術":   (68, 55, 40, 60, 20, None, 199, {"color": "yellow", "beard": 1}),
    "呂蒙":   (88, 89, 75, 78, 80, 178, 219, {"color": "blue", "beard": 1}),
    "陸遜":   (69, 96, 87, 85, 85, 183, 245, {"color": "purple", "beard": 0, "hat": "scarf"}),
    "甘寧":   (94, 70, 40, 60, 55, None, None, {"color": "blue", "beard": 1}),
    "太史慈": (93, 66, 55, 70, 90, 166, 206, {"color": "red", "beard": 1}),
    "張遼":   (95, 78, 58, 72, 85, 169, 222, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "徐晃":   (91, 72, 55, 65, 80, None, 227, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "張郃":   (90, 69, 50, 60, 65, None, 231, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "夏侯惇": (93, 60, 55, 70, 90, None, 220, {"color": "black", "beard": 1, "hat": "helmet"}),
    "夏侯淵": (91, 55, 45, 60, 80, None, 219, {"color": "black", "beard": 1, "hat": "helmet"}),
    "曹仁":   (89, 60, 58, 65, 85, 168, 223, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "許褚":   (96, 36, 20, 50, 95, None, None, {"color": "black", "beard": 1, "hat": "topknot"}),
    "典韋":   (95, 35, 20, 45, 100, None, 197, {"color": "black", "beard": 1}),
    "郭嘉":   (15, 98, 80, 70, 75, 170, 207, {"color": "white", "beard": 0, "hat": "civil"}),
    "荀彧":   (30, 95, 96, 80, 85, 163, 212, {"color": "white", "beard": 1, "hat": "civil"}),
    "荀攸":   (25, 93, 88, 70, 80, 157, 214, {"color": "white", "beard": 1, "hat": "civil"}),
    "賈詡":   (35, 97, 85, 60, 50, 147, 223, {"color": "white", "beard": 1, "hat": "civil"}),
    "程昱":   (45, 90, 80, 60, 75, 141, 220, {"color": "white", "beard": 2, "hat": "civil", "old": True}),
    "王允":   (20, 75, 80, 70, 80, 137, 192, {"color": "pink", "beard": 1, "hat": "civil", "old": True}),
    "陳宮":   (55, 90, 75, 65, 80, None, 198, {"color": "white", "beard": 1, "hat": "civil"}),
    "公孫瓚": (85, 60, 55, 70, 60, None, 199, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "劉表":   (45, 65, 75, 80, 55, 142, 208, {"color": "pink", "beard": 2, "old": True}),
    "劉璋":   (30, 45, 50, 60, 55, None, None, {"color": "pink", "beard": 1}),
    "劉禪":   (10, 35, 30, 60, 60, 207, 271, {"color": "pink", "beard": 0}),
    "馬騰":   (88, 50, 45, 70, 80, None, 212, {"color": "red", "beard": 2, "hat": "helmet"}),
    "韓遂":   (80, 60, 50, 55, 30, None, 215, {"color": "yellow", "beard": 2, "old": True}),
    "陶謙":   (40, 55, 65, 75, 80, 132, 194, {"color": "pink", "beard": 2, "hat": "civil", "old": True}),
    "孔融":   (25, 70, 60, 75, 80, 153, 208, {"color": "white", "beard": 1, "hat": "civil"}),
    "張魯":   (50, 60, 70, 75, 60, None, None, {"color": "purple", "beard": 1, "hat": "scarf"}),
    "嚴顏":   (82, 65, 55, 60, 85, None, None, {"color": "pink", "beard": 3, "old": True}),
    "龐德":   (94, 55, 40, 55, 90, None, 219, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "鄧艾":   (87, 92, 80, 60, 85, 197, 264, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "鍾會":   (60, 92, 70, 55, 25, 225, 264, {"color": "white", "beard": 0, "hat": "civil"}),
    "曹丕":   (60, 80, 85, 75, 50, 187, 226, {"color": "white", "beard": 1}),
    "華雄":   (90, 40, 20, 40, 60, None, 191, {"color": "black", "beard": 1, "hat": "helmet"}),
    "顏良":   (93, 40, 25, 35, 70, None, 200, {"color": "black", "beard": 1, "hat": "helmet"}),
    "文醜":   (92, 38, 25, 35, 70, None, 200, {"color": "black", "beard": 1, "hat": "helmet"}),
    "張昭":   (15, 88, 94, 75, 80, 156, 236, {"color": "white", "beard": 2, "hat": "civil", "old": True}),
    "黃蓋":   (83, 70, 60, 65, 95, None, None, {"color": "yellow", "beard": 2, "old": True}),
    "程普":   (80, 72, 65, 68, 90, None, None, {"color": "red", "beard": 2, "old": True}),
    "孟獲":   (87, 35, 25, 60, 60, None, None, {"color": "black", "beard": 3}),
    "李傕":   (75, 45, 20, 30, 20, None, 198, {"color": "black", "beard": 1}),
    "郭汜":   (74, 40, 18, 28, 20, None, 197, {"color": "black", "beard": 1}),
    "張繡":   (85, 55, 45, 55, 60, None, 207, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "劉焉":   (35, 65, 72, 70, 55, None, 194, {"color": "pink", "beard": 2, "old": True}),
    "何進":   (55, 40, 45, 55, 50, None, 189, {"color": "yellow", "beard": 2}),
}

COLORS = ["red", "black", "white", "yellow", "blue", "purple", "pink"]


def h32(s):
    return int(hashlib.md5(s.encode("utf-8")).hexdigest()[:8], 16)


def auto_color(wu, zhi, yi, seed):
    if yi >= 85 and wu >= 70:
        return "red"
    if zhi >= 88:
        return "white"
    if wu >= 88 and zhi < 55:
        return "black"
    if wu >= 85:
        return "blue"
    return COLORS[seed % 7]


def auto_hat(wu, zheng):
    if wu >= 80:
        return "helmet"
    if zheng >= 70:
        return "civil"
    return "topknot"


def minor_stats(name):
    """事實句數定強度上限, hash 定分佈。可重跑, 完全確定性。"""
    f = FACTS.get(name, 0)
    cap = 40 + min(35, round(9 * math.log2(1 + f)))  # f=0→40, f=10→71, f=30→85 上限 75
    cap = min(cap, 78)  # 配角不得超過主要武將水準
    s = h32(name)
    ws = [(s >> k) % 100 for k in (0, 7, 14, 21)]
    total = sum(ws) or 1
    base = [max(20, min(cap, round(20 + (cap - 20) * w * 2.2 / total))) for w in ws]
    wu, zhi, zheng, mei = base
    yi = 35 + (s >> 28 & 63)
    return wu, zhi, zheng, mei, min(yi, 100)


# ---- 載入 characters.py ----
chars_py = os.path.join(WIKI, "scripts", "characters.py")
ns = {}
with open(chars_py, encoding="utf-8") as fh:
    exec(fh.read(), ns)
CHARACTERS = ns["CHARACTERS"]

# ---- 統計事實句數 ----
FACTS = {}
for fp in glob.glob(os.path.join(WIKI, "data", "facts", "ch_*.json")):
    with open(fp, encoding="utf-8") as fh:
        for name, sents in json.load(fh).items():
            FACTS[name] = FACTS.get(name, 0) + len(sents)

# ---- 產生武將表 ----
used_ids = {}
officers = []
try:
    from pypinyin import lazy_pinyin

    def make_id(name):
        return "".join(lazy_pinyin(name))
except ImportError:
    def make_id(name):
        return "u" + hashlib.md5(name.encode()).hexdigest()[:8]

for name, aliases in CHARACTERS.items():
    if name in EXCLUDE:
        continue
    oid = make_id(name)
    if oid in used_ids:
        used_ids[oid] += 1
        oid = f"{oid}{used_ids[oid]}"
    else:
        used_ids[oid] = 1

    if name in M:
        wu, zhi, zheng, mei, yi, birth, death, face = M[name]
        face = dict(face)
        tier = "major"
    else:
        wu, zhi, zheng, mei, yi = minor_stats(name)
        birth = death = None
        face = {}
        tier = "minor"

    s = h32(name + "face")
    face.setdefault("color", auto_color(wu, zhi, yi, s))
    face.setdefault("beard", (s >> 3) % 4 if tier == "minor" else 1)
    face.setdefault("hat", auto_hat(wu, zheng))

    officers.append({
        "id": oid,
        "name": name,
        "aliases": aliases,
        "tier": tier,
        "facts": FACTS.get(name, 0),
        "birth": birth,
        "death": death,
        "stats": {"wu": wu, "zhi": zhi, "zheng": zheng, "mei": mei, "yi": yi},
        "face": face,
        "wiki": None,  # 之後接 sanguo-wiki 人物頁 URL
    })

officers.sort(key=lambda o: (-o["facts"], o["id"]))

os.makedirs(OUT, exist_ok=True)
with open(os.path.join(OUT, "officers.json"), "w", encoding="utf-8") as fh:
    json.dump(officers, fh, ensure_ascii=False, indent=1)
with open(os.path.join(OUT, "officers.js"), "w", encoding="utf-8") as fh:
    fh.write("window.OFFICERS = ")
    json.dump(officers, fh, ensure_ascii=False, separators=(",", ":"))
    fh.write(";\n")

majors = sum(1 for o in officers if o["tier"] == "major")
print(f"officers: {len(officers)} (major {majors}, minor {len(officers) - majors})")
print(f"facts coverage: {sum(1 for o in officers if o['facts'] > 0)}/{len(officers)}")
