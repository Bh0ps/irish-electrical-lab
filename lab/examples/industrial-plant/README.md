# Integrated process plant

This is an original Sandbox build, independent of the 64 courses. It contains the maximum **80 equipment instances**, **228 real terminal-to-terminal wires** and eight spaced equipment zones. Its electrical supply is **400 V between phases**, **230.94 V phase-to-neutral**, with a separate isolated **24 V DC control circuit**.

Import `industrial-plant.circuit.json` through **Sandbox → My builds → Import circuit**, then choose **View → Fit**. Use Rear terminals to inspect its complete wiring. The stable equipment labels begin with D, P, M, W, V, H, L and Y for the eight zones.

The layout runs from left to right: distribution, process conveyor, reversing mixer and pumping on the upper row; utility drive, heating, lighting and yard services on the lower row. The first process motors remain stopped until you explicitly reset and start them. Heating, inspection lighting and yard services are independent utilities.

Try these operations:

1. Press **P08 Reset safety permission**. **V05** lights and duty pump **W07** runs. Press **P09 START**; the conveyor continues after the button releases because its actual 13–14 auxiliary contact maintains the coil. Press **P10 STOP** to stop it.
2. Switch **M09 Mixer RUN enable** on. Change **M06 Direction selector** between forward and reverse. The opposing NC auxiliary contacts and mechanically paired contactors prevent simultaneous closure. Opening the selected travel permission stops motion.
3. Change **W02 Duty selector** to transfer between pumps. Close **W04 High liquid-level assist** to request both. Two separate isolation relays keep the ordinary duty requests independent when assist is absent.
4. Switch **V04 Utility-drive RUN** on. Its separate VFD produces a labelled 35 Hz fundamental output; adjust the drive Frequency parameter to compare motor voltage and operating state. This independent utility drive is outside the process safety permission.
5. After safety permission is available, **V06** delays process ventilation by two seconds. Lower **V07 Sensor value** below its setpoint to inhibit the fan. Change **P04 Pressure sensor value** or open **P03 Guard permission** to investigate different PLC input conditions.
6. Raise **H06 Thermostat temperature** above its setpoint. The valve closes and its actual end contact removes the heater and circulation requests. The three heater branches distribute load across separate phases. **H07** is an independently latching thermal limit.
7. Drag **L02 Dimmer level**. Both mains lamps follow their actual parallel load voltages and series resistance. The two inspection LEDs retain their isolated driver supply. Turn Supply off to see the maintained emergency luminaire’s conceptual backup state.
8. Lower **Y02 Sensor value** below its setpoint to extinguish the yard lamp. Set **Y04 Alarm** true to see the actual interlink signal propagate to Y05. Press either P06/P07 emergency channel: process permission and the pump requests drop. Release it, then reset again; release alone cannot rearm it.

The wiring uses the neutral and protective bars’ distinct clamps and bounded branching through actual common supply/return terminals so every wire can be routed without crowded central anchors. These are simulator connections, with feeder resistance included in the calculated results. No hidden lesson controls or manufactured values drive the loads.

Reproduce the original JSON and verification report with:

```powershell
node --import tsx examples/industrial-plant/build-plant.ts
```

`validation-report.json` records the actual source-solver operating, fault, import, detailed-asset and wire-clearance checks. These are steady-state training models: safety relay performance, real VFD switching waveforms, motor torque, physical installation ratings and manufacturer-specific protection timing are not certified by this demo.
