Gem::Specification.new do |spec|
  spec.name = "identifold"
  spec.version = "1.0.0"
  spec.summary = "Identifold 1.0 identifiers for Ruby"
  spec.description = "UUIDv7 MIDs, TypeID-compatible PIDs, and checksummed human references."
  spec.authors = ["Greyfoundry"]
  spec.license = "Apache-2.0"
  spec.homepage = "https://github.com/greyfoundry/identifold"
  spec.required_ruby_version = ">= 3.2"
  spec.files = Dir["lib/**/*.rb"] + ["README.md"]
  spec.require_paths = ["lib"]
  spec.add_dependency "pg", "~> 1.6"
  spec.add_dependency "sqlite3", "~> 2.9"
end
