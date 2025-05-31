package main

import "fmt"
import "unsafe"

// Example of poorly aligned struct - lots of padding
type BadLayout struct {
	A bool    // 1 byte
	B int64   // 8 bytes (7 bytes padding before)
	C bool    // 1 byte
	D int64   // 8 bytes (7 bytes padding before)
	E int32   // 4 bytes
	F bool    // 1 byte (3 bytes padding after for struct alignment)
}

// Example of well-aligned struct - minimal padding
type GoodLayout struct {
	B int64   // 8 bytes
	D int64   // 8 bytes
	E int32   // 4 bytes
	A bool    // 1 byte
	C bool    // 1 byte
	F bool    // 1 byte (1 byte padding after for alignment)
}

// Complex struct with various types
type ComplexStruct struct {
	ID       uint64                 // 8 bytes
	Name     string                 // 16 bytes (ptr + len)
	Tags     []string               // 24 bytes (ptr + len + cap)
	Metadata map[string]interface{} // 8 bytes (pointer)
	Handler  func() error           // 8 bytes (pointer)
	Data     *[]byte                // 8 bytes (pointer)
	Active   bool                   // 1 byte
	Count    int32                  // 4 bytes (3 bytes padding before)
}

// Embedded struct example
type Address struct {
	Street string
	City   string
	ZIP    int32
}

type Person struct {
	Name    string
	Age     int32
	Address        // embedded struct
	Email   string
}

// Array and slice examples
type ArrayExample struct {
	FixedArray [10]int32  // 40 bytes
	Slice      []int32    // 24 bytes
	Matrix     [3][3]int  // 72 bytes on 64-bit
}

func main() {
	fmt.Printf("BadLayout size: %d\n", unsafe.Sizeof(BadLayout{}))
	fmt.Printf("GoodLayout size: %d\n", unsafe.Sizeof(GoodLayout{}))
	fmt.Printf("ComplexStruct size: %d\n", unsafe.Sizeof(ComplexStruct{}))
	fmt.Printf("Person size: %d\n", unsafe.Sizeof(Person{}))
	fmt.Printf("ArrayExample size: %d\n", unsafe.Sizeof(ArrayExample{}))
}