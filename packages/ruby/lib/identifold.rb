module Identifold
  DATA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
  CHECK = DATA + "*~$=U"
  TYPE_ID = "0123456789abcdefghjkmnpqrstvwxyz"

  class Error < ArgumentError
    attr_reader :code

    def initialize(code)
      super(code)
      @code = code
    end
  end

  module_function

  def parse_machine_id(input)
    value = input.to_s.downcase
    raise Error, "invalid_mid" unless value.match?(/\A[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z/)
    raise Error, "invalid_uuid_version" unless value[14] == "7"
    raise Error, "invalid_mid" unless "89ab".include?(value[19])

    value
  end

  def public_id_from_machine_id(machine_id, namespace)
    raise Error, "invalid_public_prefix" unless namespace.match?(/\A[a-z](?:[a-z_]{0,61}[a-z])?\z/)

    number = parse_machine_id(machine_id).delete("-").to_i(16)
    suffix = Array.new(26, "0")
    25.downto(0) do |index|
      suffix[index] = TYPE_ID[number & 31]
      number >>= 5
    end
    "#{namespace}_#{suffix.join}"
  end

  def parse_public_id(value)
    raise Error, "invalid_pid" unless value == value.downcase

    separator = value.rindex("_")
    raise Error, "invalid_public_prefix" unless separator

    namespace = value[...separator]
    suffix = value[(separator + 1)..]
    raise Error, "invalid_public_prefix" unless namespace.match?(/\A[a-z](?:[a-z_]{0,61}[a-z])?\z/)
    raise Error, "invalid_pid" unless suffix.length == 26 && suffix[0] <= "7"

    number = 0
    suffix.each_char do |symbol|
      position = TYPE_ID.index(symbol)
      raise Error, "invalid_pid" unless position

      number = (number << 5) | position
    end
    hex = number.to_s(16).rjust(32, "0")
    machine_id = [hex[0, 8], hex[8, 4], hex[12, 4], hex[16, 4], hex[20, 12]].join("-")
    begin
      machine_id = parse_machine_id(machine_id)
    rescue Error
      raise Error, "invalid_pid"
    end
    { value: value, namespace: namespace, machineId: machine_id }
  end

  def check_symbol(payload, sequential)
    alphabet = sequential ? "0123456789" : DATA
    base = sequential ? 10 : 32
    remainder = 0
    payload.each_char do |symbol|
      position = alphabet.index(symbol)
      raise Error, "invalid_ref_symbol" unless position

      remainder = (remainder * base + position) % 37
    end
    CHECK[remainder]
  end

  def create_reference_candidate(registry, namespace, random_bytes)
    reference = find_namespace(registry, namespace)["reference"]
    raise Error, "unknown_namespace" unless reference && reference["strategy"] == "random"

    length = profile_length(reference["profile"])
    raise Error, "invalid_random_source" if random_bytes.length < length

    payload = random_bytes.first(length).map do |value|
      raise Error, "invalid_random_source" unless value.between?(0, 255)

      DATA[value % 32]
    end.join
    "#{reference["prefix"]}-#{group(payload)}-#{check_symbol(payload, false)}"
  end

  def format_sequential_reference(registry, namespace, sequence, scope = "")
    reference = find_namespace(registry, namespace)["reference"]
    raise Error, "unknown_namespace" unless reference && reference["strategy"] == "sequence"

    width = reference["width"]
    raise Error, "sequence_overflow" unless sequence.match?(/\A\d+\z/) && sequence.length <= width

    padded = sequence.rjust(width, "0")
    payload = scope + padded
    "#{reference["prefix"]}-#{scope.empty? ? "" : "#{scope}-"}#{padded}-#{check_symbol(payload, true)}"
  end

  def normalize(value, registry)
    if value.include?("_")
      parsed = parse_public_id(value)
      find_namespace(registry, parsed[:namespace])
      return parsed[:value]
    end
    return parse_machine_id(value) if value.length == 36

    compact = value.upcase.delete("-")
    definition = registry.find do |candidate|
      reference = candidate["reference"]
      reference && compact.start_with?(reference["prefix"])
    end
    unless definition
      raise Error, value.match?(/\A[A-Za-z]{2,8}/) ? "unknown_namespace" : "invalid_kind"
    end

    reference = definition["reference"]
    body = compact[reference["prefix"].length..]
    raise Error, "invalid_ref" if body.include?("?") || body.include?("_")

    if reference["strategy"] == "sequence"
      scope_length = reference["scope"] == "calendar-year" ? 4 : 0
      raise Error, "invalid_ref_length" unless body.length == scope_length + reference["width"] + 1

      payload = body[...-1]
      raise Error, "invalid_checksum" unless check_symbol(payload, true) == body[-1]

      return format_sequential_reference(
        registry,
        definition["publicPrefix"],
        payload[scope_length..],
        payload[0, scope_length]
      )
    end

    length = profile_length(reference["profile"])
    raise Error, "invalid_ref_length" unless body.length == length + 1

    payload = body[0, length].tr("OIL", "011")
    raise Error, "invalid_checksum" unless check_symbol(payload, false) == body[-1]

    "#{reference["prefix"]}-#{group(payload)}-#{body[-1]}"
  end

  def find_namespace(registry, namespace)
    registry.find { |definition| definition["publicPrefix"] == namespace } || raise(Error, "unknown_namespace")
  end
  private_class_method :find_namespace

  def profile_length(profile)
    { "compact" => 8, "high" => 12 }.fetch(profile, 10)
  end
  private_class_method :profile_length

  def group(value)
    value.scan(/.{1,4}/).join("-")
  end
  private_class_method :group
end
