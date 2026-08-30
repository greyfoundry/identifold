fn main() {
    let mid = "019d4c72-c910-7a84-b313-53c3ac61a32f";
    let pid = identifold::public_id_from_machine_id(mid, "order").expect("valid MID");
    let parsed = identifold::parse_public_id(&pid).expect("valid PID");
    let round_trip = parsed.machine_id == mid;
    assert!(round_trip, "MID/PID round trip failed");

    println!(
        "{{\n  \"mid\": \"{mid}\",\n  \"namespace\": \"{}\",\n  \"pid\": \"{pid}\",\n  \"roundTrip\": {round_trip}\n}}",
        parsed.namespace
    );
}
