// TrustZone configuration for the NXP i.MX6UL on USB Armory MK II.
//
// Sets up memory isolation between Secure and Non-Secure worlds using
// the TZASC (TrustZone Address Space Controller) and CSU (Central
// Security Unit).

package main

import (
	"github.com/usbarmory/tamago/arm/tzc380"
	"github.com/usbarmory/tamago/soc/nxp/csu"
	"github.com/usbarmory/tamago/soc/nxp/imx6ul"
)

func configureTrustZone() error {
	// Grant NonSecure access to co-processor regions
	for i := 0; i <= 1; i++ {
		if err := imx6ul.CSU.SetAccess(i, true, false); err != nil {
			return err
		}
	}

	// Configure TZASC to restrict Secure World memory from NonSecure access
	if err := imx6ul.TZASC.EnableRegion(0, 0, 0, (1<<tzc380.SP_NW_RD)|(1<<tzc380.SP_NW_WR)); err != nil {
		return err
	}

	// Protect Secure World memory region (256 MB window starting at
	// SecureStart). TZC-380 requires power-of-two region sizes; the
	// region is intentionally larger than SecureSize so the watchdog,
	// crypto engines, and DMA are all covered.
	const secureRegionSize = 1 << 28 // 256 MB
	if err := imx6ul.TZASC.EnableRegion(1, SecureStart, secureRegionSize, (1<<tzc380.SP_SW_RD)|(1<<tzc380.SP_SW_WR)); err != nil {
		return err
	}

	// Restrict access to sensitive peripherals
	for _, id := range []int{
		13, // GPIO (secure LED)
		15, // Watchdog
		22, // IOMUXC_SNVS
		36, // ROMCP
	} {
		if err := imx6ul.CSU.SetAccess(id, false, false); err != nil {
			return err
		}
	}

	// Set DCP as Secure-only
	if imx6ul.DCP != nil {
		if err := imx6ul.CSU.SetAccess(34, false, false); err != nil {
			return err
		}
		imx6ul.CSU.SetSecurityLevel(34, 0, csu.SEC_LEVEL_4, false)
	}

	return nil
}
