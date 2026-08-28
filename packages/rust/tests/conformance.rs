use identifold::{check_symbol, parse_public_id, public_id_from_machine_id};

#[test]
fn public_id_round_trips() {
    let mid = "019d4c72-c910-7a84-b313-53c3ac61a32f";
    let pid = public_id_from_machine_id(mid, "order").unwrap();
    assert_eq!(pid, "order_01kn675j8gfa2b64tkrep638sf");
    let parsed = parse_public_id(&pid).unwrap();
    assert_eq!(parsed.machine_id, mid);
    assert_eq!(parsed.namespace, "order");
}

#[test]
fn reference_checks_match_the_contract() {
    assert_eq!(check_symbol("0123456789", false), Some('P'));
    assert_eq!(check_symbol("2026001842", true), Some('M'));
}
