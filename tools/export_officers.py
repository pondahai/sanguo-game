# -*- coding: utf-8 -*-
"""
從 sanguo-wiki 轉出遊戲武將表。
輸入:
  ../sanguo-wiki/scripts/characters.py  (正名->別名字典)
  ../sanguo-wiki/data/facts/ch_*.json   (逐回事實句, 用事實句總數當配角活躍度)
  ../sanguo-wiki/data/candidates.json   (候選人物出現次數, facts 未涵蓋者的活躍度替代)
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
    "甘夫人", "糜夫人", "蔡夫人", "蔡氏", "嚴氏", "伏后",
    "曹芳", "孫亮", "孫休", "伏完", "喬國老", "楊彪",
    "南華老仙", "左慈", "于吉", "管輅", "華佗", "吉平",
    "曹嵩", "曹騰", "橋玄", "劉貞", "劉雄", "劉弘", "張世平", "蘇雙", "左豐",
    "何顒", "許劭", "鄭玄", "蔡邕", "唐周", "禰衡", "楊修",
}
# 禰衡/楊修/華佗 等名士暫排除(無法帶兵), 想加回來改這裡即可
# 第二批(wiki 擴到 351 人後新增): 女眷、在位傀儡帝、國丈/老臣等不帶兵者
# 有實職的文官(鍾繇/毛玠/虞翻/許靖/費禕…)保留, 靠政治值發揮

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

    # ---- 第二批: wiki 擴編至 351 人後補鎖 ----
    # 規則生成只看活躍度＋hash, 定位常常顛倒(鍾繇武力 73、文鴦智力 71),
    # 故把辨識度高的再手工鎖一輪; 生卒年一併補上, 順便擋掉後三國人物在 189 年登場。
    # 蜀漢
    "馬良":   (35, 88, 85, 80, 90, 187, 222, {"color": "white", "beard": 0, "hat": "civil"}),
    "黃權":   (70, 84, 82, 72, 80, None, 240, {"color": "blue", "beard": 1}),
    "蔣琬":   (25, 88, 92, 78, 88, None, 246, {"color": "white", "beard": 1, "hat": "civil"}),
    "費禕":   (28, 87, 90, 80, 88, None, 253, {"color": "white", "beard": 0, "hat": "civil"}),
    "諸葛瞻": (65, 72, 70, 78, 95, 227, 263, {"color": "purple", "beard": 0, "hat": "helmet"}),
    "伊籍":   (30, 78, 76, 72, 85, None, None, {"color": "white", "beard": 1, "hat": "civil"}),
    "王甫":   (35, 72, 70, 60, 88, None, 222, {"color": "white", "beard": 1, "hat": "civil"}),
    "傅僉":   (86, 60, 45, 55, 92, None, 263, {"color": "red", "beard": 0, "hat": "helmet"}),
    "傅彤":   (82, 55, 40, 50, 92, None, 222, {"color": "red", "beard": 1, "hat": "helmet"}),
    "馮習":   (75, 50, 40, 45, 75, None, 222, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "張南":   (73, 48, 38, 45, 75, None, 222, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "高翔":   (72, 55, 45, 50, 75, None, None, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "陳式":   (70, 45, 35, 45, 55, None, 231, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "傅士仁": (62, 40, 35, 35, 15, None, None, {"color": "yellow", "beard": 1}),
    "呂凱":   (40, 78, 80, 65, 88, None, None, {"color": "white", "beard": 0, "hat": "civil"}),
    "郤正":   (15, 78, 82, 60, 85, None, 278, {"color": "white", "beard": 1, "hat": "civil"}),
    # 曹魏
    "劉曄":   (45, 92, 85, 70, 60, None, 234, {"color": "white", "beard": 1, "hat": "civil"}),
    "鍾繇":   (30, 85, 90, 75, 75, 151, 230, {"color": "white", "beard": 2, "hat": "civil", "old": True}),
    "辛毗":   (25, 84, 82, 70, 80, None, 235, {"color": "white", "beard": 1, "hat": "civil"}),
    "賈充":   (50, 82, 80, 55, 20, 217, 282, {"color": "white", "beard": 1, "hat": "civil"}),
    "夏侯尚": (78, 70, 65, 65, 75, None, 226, {"color": "black", "beard": 1, "hat": "helmet"}),
    "曹彰":   (92, 45, 40, 65, 80, 189, 223, {"color": "yellow", "beard": 1, "hat": "helmet"}),
    "毛玠":   (25, 80, 85, 65, 80, None, 216, {"color": "white", "beard": 1, "hat": "civil"}),
    "臧霸":   (82, 65, 60, 62, 70, None, None, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "賈逵":   (55, 82, 84, 68, 80, 174, 228, {"color": "white", "beard": 1, "hat": "civil"}),
    "王基":   (70, 82, 80, 65, 80, 190, 261, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "毋丘儉": (78, 75, 68, 65, 60, None, 255, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "文欽":   (85, 45, 35, 45, 35, None, 258, {"color": "black", "beard": 1, "hat": "helmet"}),
    "文鴦":   (96, 55, 40, 60, 70, 238, 291, {"color": "red", "beard": 0, "hat": "helmet"}),
    "高覽":   (85, 55, 45, 50, 60, None, 200, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "韓浩":   (72, 62, 65, 55, 75, None, None, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "朱靈":   (78, 60, 50, 50, 65, None, None, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "牛金":   (70, 40, 30, 40, 60, None, None, {"color": "black", "beard": 1, "hat": "helmet"}),
    "徐質":   (85, 40, 30, 45, 55, None, 254, {"color": "black", "beard": 1, "hat": "helmet"}),
    "鄧忠":   (84, 65, 50, 55, 85, 227, 264, {"color": "blue", "beard": 0, "hat": "helmet"}),
    "諸葛緒": (60, 60, 60, 55, 55, None, None, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "桓範":   (30, 82, 78, 60, 70, None, 249, {"color": "white", "beard": 2, "hat": "civil", "old": True}),
    "王經":   (40, 70, 72, 65, 90, None, 260, {"color": "white", "beard": 1, "hat": "civil"}),
    "胡遵":   (75, 55, 50, 50, 60, None, None, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "樂綝":   (75, 50, 45, 50, 65, None, 257, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "張虎":   (70, 45, 40, 45, 60, None, None, {"color": "blue", "beard": 0, "hat": "helmet"}),
    "司馬望": (70, 75, 72, 60, 60, 205, 271, {"color": "white", "beard": 1, "hat": "helmet"}),
    "王雙":   (88, 30, 20, 40, 55, None, 228, {"color": "black", "beard": 3, "hat": "helmet"}),
    "李肅":   (65, 55, 40, 40, 15, None, 192, {"color": "yellow", "beard": 1}),
    # 孫吳
    "朱然":   (82, 72, 65, 65, 80, 182, 249, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "呂範":   (65, 75, 80, 72, 80, None, 228, {"color": "white", "beard": 1, "hat": "civil"}),
    "陳武":   (85, 45, 35, 50, 80, None, 215, {"color": "black", "beard": 1, "hat": "helmet"}),
    "董襲":   (83, 45, 35, 48, 80, None, 215, {"color": "black", "beard": 1, "hat": "helmet"}),
    "朱桓":   (85, 75, 65, 65, 70, 177, 238, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "虞翻":   (30, 85, 78, 55, 60, 164, 233, {"color": "white", "beard": 1, "hat": "civil"}),
    "張紘":   (20, 86, 90, 72, 80, 153, 212, {"color": "white", "beard": 2, "hat": "civil", "old": True}),
    "孫韶":   (75, 65, 60, 58, 75, 188, 241, {"color": "yellow", "beard": 1, "hat": "helmet"}),
    "周魴":   (60, 85, 70, 60, 60, None, None, {"color": "white", "beard": 1, "hat": "civil"}),
    "孫桓":   (78, 65, 55, 60, 75, 198, 223, {"color": "yellow", "beard": 0, "hat": "helmet"}),
    "朱異":   (78, 70, 60, 55, 60, None, 257, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "孫峻":   (72, 60, 40, 40, 10, 219, 256, {"color": "yellow", "beard": 0, "hat": "helmet"}),
    # 群雄・在野
    "劉繇":   (35, 55, 62, 68, 60, 156, 197, {"color": "pink", "beard": 1, "hat": "civil"}),
    "張邈":   (50, 60, 65, 70, 60, None, 195, {"color": "yellow", "beard": 1}),
    "張楊":   (60, 55, 55, 60, 60, None, 198, {"color": "yellow", "beard": 1}),
    "丁原":   (70, 55, 55, 60, 70, None, 189, {"color": "yellow", "beard": 2, "hat": "helmet"}),
    "韓玄":   (45, 40, 45, 35, 25, None, 209, {"color": "yellow", "beard": 1}),
    "蒯良":   (25, 82, 80, 65, 70, None, None, {"color": "white", "beard": 1, "hat": "civil"}),
    "蒯越":   (30, 84, 82, 68, 55, None, 214, {"color": "white", "beard": 1, "hat": "civil"}),
    "陳珪":   (30, 80, 78, 60, 70, None, None, {"color": "white", "beard": 2, "hat": "civil", "old": True}),
    "張濟":   (78, 45, 35, 45, 50, None, 196, {"color": "black", "beard": 1, "hat": "helmet"}),
    "樊稠":   (76, 40, 25, 40, 35, None, 195, {"color": "black", "beard": 1, "hat": "helmet"}),
    "侯成":   (70, 40, 30, 40, 20, None, None, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "宋憲":   (68, 35, 25, 38, 20, None, 200, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "魏續":   (67, 35, 25, 38, 20, None, None, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "車胄":   (60, 40, 45, 45, 50, None, 199, {"color": "yellow", "beard": 1}),
    "高幹":   (68, 55, 50, 50, 50, None, 206, {"color": "yellow", "beard": 1, "hat": "helmet"}),
    "袁熙":   (60, 50, 50, 55, 55, None, 207, {"color": "yellow", "beard": 0}),
    "逢紀":   (25, 78, 70, 50, 40, None, 202, {"color": "white", "beard": 1, "hat": "civil"}),
    "劉琮":   (20, 35, 40, 50, 50, None, None, {"color": "pink", "beard": 0}),
    "楊阜":   (60, 82, 80, 65, 85, None, None, {"color": "white", "beard": 1, "hat": "civil"}),
    "公孫康": (65, 70, 65, 55, 40, None, 221, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "公孫淵": (60, 50, 45, 45, 15, 200, 238, {"color": "blue", "beard": 1, "hat": "helmet"}),
    "管亥":   (78, 30, 20, 35, 40, None, 195, {"color": "yellow", "beard": 3, "hat": "topknot"}),
    "韓暹":   (65, 40, 30, 35, 30, None, 197, {"color": "yellow", "beard": 1}),
    "楊松":   (20, 45, 40, 25, 5, None, 215, {"color": "white", "beard": 1, "hat": "civil"}),
    "趙範":   (40, 50, 55, 50, 45, None, None, {"color": "pink", "beard": 1, "hat": "civil"}),
    # 南蠻・西羌
    "兀突骨": (95, 20, 10, 45, 40, None, 225, {"color": "black", "beard": 3, "hat": "topknot"}),
    "董荼那": (78, 40, 35, 50, 70, None, 225, {"color": "black", "beard": 1, "hat": "topknot"}),
    "孟優":   (65, 35, 30, 45, 60, None, None, {"color": "black", "beard": 0, "hat": "topknot"}),
    "鄂煥":   (85, 30, 20, 40, 60, None, None, {"color": "black", "beard": 3, "hat": "topknot"}),
    "雅丹":   (35, 60, 55, 45, 50, None, None, {"color": "yellow", "beard": 1, "hat": "civil"}),
}

# ---- 只鎖生卒年、數值仍走自動規則的人物: (生年, 卒年) ----
# 這批是三國後期人物, 沒有生年的話 State.available() 會讓他們 189 年開局就站在地圖上。
# 數值沒有非改不可的理由, 故不進 M, 只補時序。
# 生年不詳者(曹爽/何晏/李勝/李豐/陳泰/諸葛誕/師纂/蔣舒/王瓘/戴陵)取合理推定值,
# 只求登場時機對得上, 不當史料用。
LIFE = {
    "司馬師":   (208, 255),
    "司馬昭":   (211, 265),
    "司馬炎":   (236, 290),
    "曹叡":     (205, 239),
    "曹髦":     (241, 260),
    "曹奐":     (246, 302),
    "曹爽":     (200, 249),
    "何晏":     (195, 249),
    "李勝":     (200, 249),
    "李豐":     (200, 254),
    "陳泰":     (200, 260),
    "諸葛誕":   (195, 258),
    "諸葛恪":   (203, 253),
    "孫綝":     (231, 258),
    "孫皓":     (242, 284),
    "杜預":     (222, 285),
    "羊祜":     (221, 278),
    "王濬":     (206, 286),
    "師纂":     (210, 264),
    "蔣舒":     (210, None),
    "王瓘":     (215, 262),
    "戴陵":     (200, None),
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


def activity(name):
    """活躍度: 優先用事實句數; facts 未涵蓋的人物改用候選池出現次數換算。

    facts 是舊名單抽的, wiki 擴編後新進 143 人一句都沒有, 直接用會全部壓在
    cap=40 變成清一色庸才。舊名單中 40 人同時有 facts 與 mentions, 兩者比值
    中位數約 0.7 (事實句/出現次數), 故以此換算成等效事實句數。
    """
    f = FACTS.get(name, 0)
    if f:
        return f
    return round(MENTIONS.get(name, 0) * FACT_PER_MENTION)


def minor_stats(name):
    """活躍度定強度上限, hash 定分佈。可重跑, 完全確定性。"""
    f = activity(name)
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

# ---- 候選池出現次數 (facts 的後備活躍度來源) ----
MENTIONS = {}
cand_fp = os.path.join(WIKI, "data", "candidates.json")
if os.path.exists(cand_fp):
    with open(cand_fp, encoding="utf-8") as fh:
        for cnt, name in json.load(fh):
            MENTIONS[name] = cnt
FACT_PER_MENTION = 0.7

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
        birth, death = LIFE.get(name, (None, None))
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
        "act": activity(name),
        "birth": birth,
        "death": death,
        "stats": {"wu": wu, "zhi": zhi, "zheng": zheng, "mei": mei, "yi": yi},
        "face": face,
        "wiki": None,  # 之後接 sanguo-wiki 人物頁 URL
    })

officers.sort(key=lambda o: (-o["act"], o["id"]))

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
print(f"act coverage:   {sum(1 for o in officers if o['act'] > 0)}/{len(officers)}"
      f" (mentions 補足 {sum(1 for o in officers if not o['facts'] and o['act'])})")
