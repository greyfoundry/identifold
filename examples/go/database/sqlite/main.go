package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"

	"github.com/greyfoundry/identifold/packages/go/storage"
	sqlitestorage "github.com/greyfoundry/identifold/packages/go/storage/sqlite"
	_ "modernc.org/sqlite"
)

func main() {
	database, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		panic(err)
	}
	defer database.Close()
	migration, err := os.ReadFile("../../integrations/sqlite/migrations/001_identifold.up.sql")
	if err != nil {
		panic(err)
	}
	if _, err = database.Exec(string(migration)); err != nil {
		panic(err)
	}
	adapter := sqlitestorage.New(database)
	request := storage.ReferenceReservation{
		MachineID: "01890f8c-7b2a-7cc3-98b0-112233445566",
		Namespace: "order",
		Reference: "ORD-0123-4567-89-P",
	}
	reserved, err := adapter.Reserve(context.Background(), request)
	if err != nil {
		panic(err)
	}
	mapping, err := adapter.Resolve(context.Background(), request.Reference, request.Namespace)
	if err != nil {
		panic(err)
	}
	_ = json.NewEncoder(os.Stdout).Encode(map[string]any{"reserved": reserved, "mapping": mapping})
}
