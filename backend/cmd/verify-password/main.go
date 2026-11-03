package main

import (
	"fmt"
	"os"
	"strings"

	"github.com/borewell/visualizer/backend/internal/auth"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: verify-password <password> [hash_file]")
		fmt.Println("If hash_file is not provided, reads from stdin")
		os.Exit(1)
	}

	password := os.Args[1]
	var hash string

	if len(os.Args) >= 3 {
		// Read hash from file
		data, err := os.ReadFile(os.Args[2])
		if err != nil {
			fmt.Printf("Error reading hash file: %v\n", err)
			os.Exit(1)
		}
		hash = strings.TrimSpace(string(data))
	} else {
		// Read hash from stdin
		var input string
		fmt.Print("Enter hash: ")
		fmt.Scanln(&input)
		hash = strings.TrimSpace(input)
	}

	fmt.Printf("Hash: %s\n", hash)
	fmt.Printf("Hash length: %d\n", len(hash))

	parts := strings.Split(hash, "$")
	fmt.Printf("Parts: %d\n", len(parts))
	for i, p := range parts {
		fmt.Printf("  [%d]: %s\n", i, p)
	}

	valid, err := auth.VerifyPassword(password, hash)
	if err != nil {
		fmt.Printf("Error: %v\n", err)
		os.Exit(1)
	}

	if valid {
		fmt.Println("Password verification: SUCCESS")
	} else {
		fmt.Println("Password verification: FAILED")
		os.Exit(1)
	}
}