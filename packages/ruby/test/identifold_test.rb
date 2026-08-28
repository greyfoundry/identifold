require_relative "../lib/identifold"

mid = "019d4c72-c910-7a84-b313-53c3ac61a32f"
pid = Identifold.public_id_from_machine_id(mid, "order")
raise pid unless pid == "order_01kn675j8gfa2b64tkrep638sf"

parsed = Identifold.parse_public_id(pid)
raise parsed.inspect unless parsed[:machineId] == mid && parsed[:namespace] == "order"
raise "random checksum" unless Identifold.check_symbol("0123456789", false) == "P"
raise "sequential checksum" unless Identifold.check_symbol("2026001842", true) == "M"
