//! Repairs tag text written in old Windows code pages. Many MP3 files store
//! Russian (Windows-1251) or Lithuanian (Windows-1257) text in fields marked as
//! Latin-1, so it is read as "Íàòàøà" instead of "Наташа". The original bytes
//! are recovered and decoded with the right code page.

use encoding_rs::{WINDOWS_1251, WINDOWS_1257};

/// Latin-1 characters that are rare in Western names but are Š/š/Ž/ž in Windows-1257.
const LT_MARKERS: &[char] = &['Ð', 'ð', 'Þ', 'þ'];

/// Fixes one tag value; text that is already correct is returned unchanged.
pub fn fix_legacy(s: &str) -> String {
    // Cyrillic text that is really UTF-8 seen through Windows-1251 ("РњРђРљРЎ" = "МАКС").
    if s.chars().any(|c| ('\u{0400}'..='\u{04FF}').contains(&c)) {
        let (bytes, _, errors) = WINDOWS_1251.encode(s);
        if !errors {
            if let Ok(u) = std::str::from_utf8(&bytes) {
                if u != s && !u.is_ascii() {
                    return u.to_string();
                }
            }
        }
        return s.to_string();
    }
    // Any other real Unicode text (Lithuanian letters, CJK...) is left alone,
    // except Russian that an older version decoded as Windows-1257 ("Äóšī÷źą").
    if s.chars().any(|c| c as u32 > 0xFF) {
        let (bytes, _, errors) = WINDOWS_1257.encode(s);
        if !errors {
            let latin1: String = bytes.iter().map(|&b| b as char).collect();
            if looks_like_cp1251(&latin1) {
                return WINDOWS_1251.decode_without_bom_handling(&bytes).0.into_owned();
            }
        }
        return s.to_string();
    }
    let bytes: Vec<u8> = s.chars().map(|c| c as u32 as u8).collect();
    if bytes.is_ascii() {
        return s.to_string();
    }
    // UTF-8 stored in a field marked Latin-1 ("Ð\u{9c}Ð\u{90}" = "МА").
    if let Ok(u) = std::str::from_utf8(&bytes) {
        return u.to_string();
    }
    // Russian in Windows-1251: Cyrillic words become runs of accented Latin-1
    // letters ("Çåëåíûé"), which Western names never have, even when the
    // title mixes in English words ("Çåëåíûé Rocks").
    if looks_like_cp1251(s) {
        return WINDOWS_1251.decode_without_bom_handling(&bytes).0.into_owned();
    }
    // Lithuanian in Windows-1257: mostly ASCII with a few Š/Ž-like marks.
    if s.chars().any(|c| LT_MARKERS.contains(&c)) {
        return WINDOWS_1257.decode_without_bom_handling(&bytes).0.into_owned();
    }
    s.to_string()
}

/// A Latin-1 character that is a Cyrillic letter in Windows-1251 (А–я, Ё, ё).
fn cp1251_letter(c: char) -> bool {
    let u = c as u32;
    ((0xC0..=0xFF).contains(&u) && c != '×' && c != '÷') || u == 0xA8 || u == 0xB8
}

fn looks_like_cp1251(s: &str) -> bool {
    let mut run = 0;
    for c in s.chars() {
        if cp1251_letter(c) {
            run += 1;
            if run >= 3 {
                return true;
            }
        } else {
            run = 0;
        }
    }
    // Short words made only of such letters ("Ëà-ëà-ëà", "Òû").
    s.split(|c: char| !c.is_alphabetic() && c as u32 != 0xA8 && c as u32 != 0xB8)
        .any(|w| w.chars().count() >= 2 && w.chars().all(cp1251_letter))
}

/// Decodes raw bytes (stream titles): UTF-8 when valid, else the code page
/// that fits the text best.
pub fn decode_legacy_bytes(bytes: &[u8]) -> String {
    match std::str::from_utf8(bytes) {
        Ok(s) => s.to_string(),
        Err(_) => {
            let latin1: String = bytes.iter().map(|&b| b as char).collect();
            let fixed = fix_legacy(&latin1);
            if fixed != latin1 {
                fixed
            } else {
                WINDOWS_1257.decode_without_bom_handling(bytes).0.into_owned()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repairs_russian_tags() {
        assert_eq!(fix_legacy("016_Íàòàøà Êîðîë¸âà"), "016_Наташа Королёва");
        assert_eq!(fix_legacy("Òðè ïîëîñêè"), "Три полоски");
        assert_eq!(fix_legacy("ÄÄÒ - Îñåíü"), "ДДТ - Осень");
    }

    #[test]
    fn repairs_utf8_read_as_the_wrong_code_page() {
        // UTF-8 bytes in a Latin-1 field.
        let latin1: String = "МАКС - Сон".bytes().map(|b| b as char).collect();
        assert_eq!(fix_legacy(&latin1), "МАКС - Сон");
        // Already decoded as Windows-1251 by some other program (or an older WheelDesk).
        let garbled = WINDOWS_1251.decode_without_bom_handling("МАКСИМ - Знаешь ли ты".as_bytes()).0.into_owned();
        assert!(garbled.starts_with("РњРђ"));
        assert_eq!(fix_legacy(&garbled), "МАКСИМ - Знаешь ли ты");
        let garbled_lt = WINDOWS_1251.decode_without_bom_handling("Žalgiris – Daina".as_bytes()).0.into_owned();
        assert_eq!(fix_legacy(&garbled_lt), "Žalgiris – Daina");
    }

    #[test]
    fn real_russian_is_never_mistaken_for_garbled_utf8() {
        for s in ["Наташа Королёва", "Мумий Тролль - Владивосток 2000", "ДДТ", "Я", "Ёлка", "Сплин – Выхода нет"] {
            assert_eq!(fix_legacy(s), s, "{s}");
        }
    }

    #[test]
    fn repairs_russian_mixed_with_latin_words() {
        assert_eq!(fix_legacy("Çåëåíûé Rocks"), "Зеленый Rocks");
        assert_eq!(fix_legacy("Ëà-ëà-ëà (DJ Groove)"), "Ла-ла-ла (DJ Groove)");
        assert_eq!(fix_legacy("Êàê Õîòåë ß [Take Me With You"), "Как Хотел Я [Take Me With You");
        assert_eq!(fix_legacy("Âñ¸-Òàêè Ìîæíî (DNB BAD MF Remix)"), "Всё-Таки Можно (DNB BAD MF Remix)");
        assert_eq!(fix_legacy("Äóðî÷êà-Elektro rmx Dj Onegin"), "Дурочка-Elektro rmx Dj Onegin");
        // Already turned into Lithuanian letters by 0.3.x.
        assert_eq!(fix_legacy("Äóšī÷źą-Elektro rmx Dj Onegin"), "Дурочка-Elektro rmx Dj Onegin");
    }

    #[test]
    fn repairs_lithuanian_tags() {
        assert_eq!(fix_legacy("Þalgiris"), "Žalgiris");
        assert_eq!(fix_legacy("Ðokis"), "Šokis");
    }

    #[test]
    fn leaves_correct_text_alone() {
        for s in [
            "Björk", "Sigur Rós", "Mötley Crüe", "Voilà", "Beyoncé", "015_Jeka", "Наташа", "Žalgiris", "Ąžuolas", "", "1999",
            "C'est Une Belle Journée", "Ça Plane Pour Moi", "Où Es-Tu", "Señorita", "Cesária Évora", "Måns Zelmerlöw", "Sinéad O'Connor",
            "Æon Flux", "Déjà Vu", "Für Elise", "Šešėlis", "Žiūrėk", "Įėjęs", "Ąžuolą", "Mažoji Lietuva",
        ] {
            assert_eq!(fix_legacy(s), s, "{s}");
        }
    }

    #[test]
    fn decodes_stream_title_bytes() {
        assert_eq!(decode_legacy_bytes("Земфира".as_bytes()), "Земфира");
        let cp1251 = WINDOWS_1251.encode("Земфира - Искала").0.into_owned();
        assert_eq!(decode_legacy_bytes(&cp1251), "Земфира - Искала");
        assert_eq!(decode_legacy_bytes(b"\xDEalgiris"), "Žalgiris");
    }
}
