import io.greyfoundry.identifold.KotlinIdentifold

fun main() {
    val mid = "019d4c72-c910-7a84-b313-53c3ac61a32f"
    val pid = KotlinIdentifold.publicIdFromMachineId(mid, "order")
    val parsed = KotlinIdentifold.parsePublicId(pid)
    val roundTrip = parsed.machineId == mid
    check(roundTrip) { "MID/PID round trip failed." }
    println(
        """
        {
          "mid": "$mid",
          "namespace": "${parsed.namespace}",
          "pid": "$pid",
          "roundTrip": true
        }
        """.trimIndent(),
    )
}
