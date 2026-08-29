package io.greyfoundry.identifold

fun main(args: Array<String>) {
    try {
        val operation = args[0]
        val registry = Identifold.parseRegistry(args.getOrElse(4) { "" })
        val value = when (operation) {
            "parseMachineId" -> KotlinIdentifold.parseMachineId(args[1])
            "publicIdFromMachineId" -> KotlinIdentifold.publicIdFromMachineId(args[1], args[2])
            "parsePublicId" -> KotlinIdentifold.parsePublicId(args[1]).let {
                "${it.value}\t${it.namespace}\t${it.machineId}"
            }
            "createReferenceCandidate" -> KotlinIdentifold.createReferenceCandidate(
                registry,
                args[2],
                args[3].takeIf(String::isNotEmpty)?.split(",")?.map(String::toInt) ?: emptyList(),
            )
            "formatSequentialReference" -> KotlinIdentifold.formatSequentialReference(
                registry,
                args[2],
                args[3],
                args.getOrElse(5) { "" },
            )
            "normalize", "parseReference", "inspect" -> KotlinIdentifold.normalize(args[1], registry)
            else -> error("Unsupported operation")
        }
        print("OK\t$value")
    } catch (exception: Identifold.IdentifoldException) {
        print("ERR\t${exception.code()}")
    }
}
