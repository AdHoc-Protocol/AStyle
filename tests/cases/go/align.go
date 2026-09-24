package main

import (
	"os"
	log "github.com/x/log"
	"fmt"
)

type User struct {
	ID int `json:"id"`
	DisplayName string `json:"name"`
	Age int
}

const (
	A = 1
	Longer = 2
)
