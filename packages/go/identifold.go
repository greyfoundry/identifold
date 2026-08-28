package identifold

import (
	"encoding/hex"
	"fmt"
	"math/big"
	"regexp"
	"strings"
)

const dataAlphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
const checkAlphabet = dataAlphabet + "*~$=U"
const typeIDAlphabet = "0123456789abcdefghjkmnpqrstvwxyz"

var machinePattern = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)
var publicPrefixPattern = regexp.MustCompile(`^[a-z](?:[a-z_]{0,61}[a-z])?$`)

type Error struct{ Code string }

func (e *Error) Error() string { return e.Code }

type ParsedPublicID struct {
	Value     string `json:"value"`
	Namespace string `json:"namespace"`
	MachineID string `json:"machineId"`
}

type ReferenceDefinition struct {
	Prefix   string `json:"prefix"`
	Profile  string `json:"profile,omitempty"`
	Strategy string `json:"strategy"`
	Scope    string `json:"scope,omitempty"`
	Width    int    `json:"width,omitempty"`
}

type NamespaceDefinition struct {
	PublicPrefix string               `json:"publicPrefix"`
	Reference    *ReferenceDefinition `json:"reference,omitempty"`
}

type Registry []NamespaceDefinition

func ParseMachineID(value string) (string, error) {
	canonical := strings.ToLower(value)
	if !machinePattern.MatchString(canonical) {
		return "", &Error{Code: "invalid_mid"}
	}
	if canonical[14] != '7' {
		return "", &Error{Code: "invalid_uuid_version"}
	}
	if !strings.ContainsRune("89ab", rune(canonical[19])) {
		return "", &Error{Code: "invalid_mid"}
	}
	return canonical, nil
}

func uuidBytes(value string) ([]byte, error) {
	canonical, err := ParseMachineID(value)
	if err != nil {
		return nil, err
	}
	return hex.DecodeString(strings.ReplaceAll(canonical, "-", ""))
}

func encodeTypeIDSuffix(bytes []byte) string {
	value := new(big.Int).SetBytes(bytes)
	base := big.NewInt(32)
	mod := new(big.Int)
	result := make([]byte, 26)
	for index := 25; index >= 0; index-- {
		value.QuoRem(value, base, mod)
		result[index] = typeIDAlphabet[mod.Int64()]
	}
	return string(result)
}

func decodeTypeIDSuffix(value string) ([]byte, error) {
	if len(value) != 26 || value[0] > '7' {
		return nil, &Error{Code: "invalid_pid"}
	}
	number := new(big.Int)
	for _, symbol := range value {
		position := strings.IndexRune(typeIDAlphabet, symbol)
		if position < 0 {
			return nil, &Error{Code: "invalid_pid"}
		}
		number.Lsh(number, 5)
		number.Or(number, big.NewInt(int64(position)))
	}
	bytes := number.Bytes()
	if len(bytes) > 16 {
		return nil, &Error{Code: "invalid_pid"}
	}
	result := make([]byte, 16)
	copy(result[16-len(bytes):], bytes)
	return result, nil
}

func bytesToMachineID(bytes []byte) string {
	hexValue := hex.EncodeToString(bytes)
	return fmt.Sprintf("%s-%s-%s-%s-%s", hexValue[:8], hexValue[8:12], hexValue[12:16], hexValue[16:20], hexValue[20:])
}

func PublicIDFromMachineID(machineID, namespace string) (string, error) {
	if !publicPrefixPattern.MatchString(namespace) {
		return "", &Error{Code: "invalid_public_prefix"}
	}
	bytes, err := uuidBytes(machineID)
	if err != nil {
		return "", err
	}
	return namespace + "_" + encodeTypeIDSuffix(bytes), nil
}

func ParsePublicID(value string) (ParsedPublicID, error) {
	if value != strings.ToLower(value) {
		return ParsedPublicID{}, &Error{Code: "invalid_pid"}
	}
	separator := strings.LastIndex(value, "_")
	if separator < 0 {
		return ParsedPublicID{}, &Error{Code: "invalid_public_prefix"}
	}
	namespace, suffix := value[:separator], value[separator+1:]
	if !publicPrefixPattern.MatchString(namespace) {
		return ParsedPublicID{}, &Error{Code: "invalid_public_prefix"}
	}
	bytes, err := decodeTypeIDSuffix(suffix)
	if err != nil {
		return ParsedPublicID{}, err
	}
	machineID, err := ParseMachineID(bytesToMachineID(bytes))
	if err != nil {
		if typed, ok := err.(*Error); ok && typed.Code == "invalid_uuid_version" {
			return ParsedPublicID{}, &Error{Code: "invalid_pid"}
		}
		return ParsedPublicID{}, err
	}
	return ParsedPublicID{Value: value, Namespace: namespace, MachineID: machineID}, nil
}

func CheckSymbol(payload string, sequential bool) string {
	base := 32
	if sequential {
		base = 10
	}
	remainder := 0
	for _, symbol := range payload {
		position := strings.IndexRune(dataAlphabet, symbol)
		if sequential {
			position = strings.IndexRune("0123456789", symbol)
		}
		if position < 0 {
			return ""
		}
		remainder = (remainder*base + position) % 37
	}
	return string(checkAlphabet[remainder])
}

func findNamespace(registry Registry, namespace string) (*NamespaceDefinition, error) {
	for index := range registry {
		if registry[index].PublicPrefix == namespace {
			return &registry[index], nil
		}
	}
	return nil, &Error{Code: "unknown_namespace"}
}

func profileLength(profile string) int {
	switch profile {
	case "compact":
		return 8
	case "high":
		return 12
	default:
		return 10
	}
}

func group(value string) string {
	parts := make([]string, 0, (len(value)+3)/4)
	for len(value) > 0 {
		length := 4
		if len(value) < length {
			length = len(value)
		}
		parts = append(parts, value[:length])
		value = value[length:]
	}
	return strings.Join(parts, "-")
}

func CreateReferenceCandidate(registry Registry, namespace string, randomBytes []int) (string, error) {
	definition, err := findNamespace(registry, namespace)
	if err != nil || definition.Reference == nil || definition.Reference.Strategy != "random" {
		return "", &Error{Code: "unknown_namespace"}
	}
	length := profileLength(definition.Reference.Profile)
	if len(randomBytes) < length {
		return "", &Error{Code: "invalid_random_source"}
	}
	payload := make([]byte, length)
	for index := range payload {
		if randomBytes[index] < 0 || randomBytes[index] > 255 {
			return "", &Error{Code: "invalid_random_source"}
		}
		payload[index] = dataAlphabet[randomBytes[index]%32]
	}
	text := string(payload)
	return definition.Reference.Prefix + "-" + group(text) + "-" + CheckSymbol(text, false), nil
}

func FormatSequentialReference(registry Registry, namespace, sequence, scope string) (string, error) {
	definition, err := findNamespace(registry, namespace)
	if err != nil || definition.Reference == nil || definition.Reference.Strategy != "sequence" {
		return "", &Error{Code: "unknown_namespace"}
	}
	if len(sequence) > definition.Reference.Width {
		return "", &Error{Code: "sequence_overflow"}
	}
	sequence = strings.Repeat("0", definition.Reference.Width-len(sequence)) + sequence
	payload := scope + sequence
	parts := []string{definition.Reference.Prefix}
	if scope != "" {
		parts = append(parts, scope)
	}
	parts = append(parts, sequence, CheckSymbol(payload, true))
	return strings.Join(parts, "-"), nil
}

func Normalize(value string, registry Registry) (string, error) {
	if strings.Contains(value, "_") {
		parsed, err := ParsePublicID(value)
		if err != nil {
			return "", err
		}
		if _, err := findNamespace(registry, parsed.Namespace); err != nil {
			return "", err
		}
		return parsed.Value, nil
	}
	if machinePattern.MatchString(strings.ToLower(value)) {
		return ParseMachineID(value)
	}
	upper := strings.ToUpper(value)
	compact := strings.ReplaceAll(upper, "-", "")
	var definition *NamespaceDefinition
	for index := range registry {
		ref := registry[index].Reference
		if ref != nil && strings.HasPrefix(compact, ref.Prefix) {
			definition = &registry[index]
			break
		}
	}
	if definition == nil || definition.Reference == nil {
		if regexp.MustCompile(`^[A-Za-z]{2,8}`).MatchString(value) {
			return "", &Error{Code: "unknown_namespace"}
		}
		return "", &Error{Code: "invalid_kind"}
	}
	ref := definition.Reference
	body := compact[len(ref.Prefix):]
	if strings.ContainsAny(body, "?_") {
		return "", &Error{Code: "invalid_ref"}
	}
	if ref.Strategy == "sequence" {
		scopeLength := 0
		if ref.Scope == "calendar-year" {
			scopeLength = 4
		}
		if len(body) != scopeLength+ref.Width+1 {
			return "", &Error{Code: "invalid_ref_length"}
		}
		payload, check := body[:len(body)-1], body[len(body)-1:]
		if CheckSymbol(payload, true) == "" {
			return "", &Error{Code: "invalid_ref_symbol"}
		}
		if CheckSymbol(payload, true) != check {
			return "", &Error{Code: "invalid_checksum"}
		}
		return FormatSequentialReference(registry, definition.PublicPrefix, payload[scopeLength:], payload[:scopeLength])
	}
	length := profileLength(ref.Profile)
	if len(body) != length+1 {
		return "", &Error{Code: "invalid_ref_length"}
	}
	payload, check := body[:length], body[length:]
	normalized := strings.NewReplacer("O", "0", "I", "1", "L", "1").Replace(payload)
	if CheckSymbol(normalized, false) == "" {
		return "", &Error{Code: "invalid_ref_symbol"}
	}
	if CheckSymbol(normalized, false) != check {
		return "", &Error{Code: "invalid_checksum"}
	}
	return ref.Prefix + "-" + group(normalized) + "-" + check, nil
}
