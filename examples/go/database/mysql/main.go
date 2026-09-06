package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"os"

	_ "github.com/go-sql-driver/mysql"
	"github.com/greyfoundry/identifold/packages/go/storage"
	mysqlstorage "github.com/greyfoundry/identifold/packages/go/storage/mysql"
)

func main() {
	database, err := sql.Open("mysql", os.Getenv("IDENTIFOLD_TEST_MYSQL_URL"))
	if err != nil {
		panic(err)
	}
	defer database.Close()
	adapter := mysqlstorage.New(database)
	request := storage.ReferenceReservation{
		MachineID: "01890f8c-7b2a-7cc3-98b0-112233445568",
		Namespace: "order",
		Reference: "ORD-9876-5432-10-X",
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
