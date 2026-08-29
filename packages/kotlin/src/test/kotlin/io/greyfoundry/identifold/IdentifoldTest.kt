package io.greyfoundry.identifold

fun main() {
    val mid = "019d4c72-c910-7a84-b313-53c3ac61a32f"
    val pid = KotlinIdentifold.publicIdFromMachineId(mid, "order")
    check(pid == "order_01kn675j8gfa2b64tkrep638sf")
    val parsed = KotlinIdentifold.parsePublicId(pid)
    check(parsed.machineId == mid)
    check(parsed.namespace == "order")
    check(KotlinIdentifold.checkSymbol("0123456789", false) == 'P')
    check(KotlinIdentifold.checkSymbol("2026001842", true) == 'M')
}
