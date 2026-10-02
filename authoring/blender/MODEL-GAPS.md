# Model construction audit, detail revision 2

The earlier 87-variant library contains useful distinct outer forms and fixed rear connection points, but several interiors are sparse or share a generic recipe. The revision keeps those electrical interfaces and improves construction in every authoring family. Each generated asset exposes `detailFamily`, `detailRevision` and `detailFeatures`; the source retains editable `detailId` assemblies and their purposes.

| Family | Earlier gap | Revision requirements |
|---|---|---|
| Supply / meter | Context box, sparse internal current path | Service cartridge and insulated tails; current bars, shunt, isolation shield and sensing PCB |
| Enclosures / bars | Flat DIN rail, token busbar | Rail return flanges, comb feed teeth, insulated supports and enclosure bonding eye/washer |
| Protective devices | Shared sparse thermal/contact mechanism | MCB arc splitter, solenoid and bimetal; RCCB sensing toroid and test path; SPD MOV/thermal disconnect; fuse cartridge |
| Switches | Simple brass leaf, generic mechanism | Contact cassette, silver contact tips, snap spring/cam; dimmer triac/heatsink/choke; recessed face fixings |
| Sockets / plugs / FCU | Solid female contact faces, no shutter mechanism | Female sleeve aperture, spring jaws, earth-operated shutter/return spring, fuse and strain relief |
| Junctions / roses | Flat box with minimal cable handling | Cable entry grommets, wire guides, cover bosses and threaded captive hardware |
| Lamps / LED / emergency | Sparse emitter supports | Bulb stem/leads/coiled filament; LED spreader/board; emergency charge interface; separate mounting hardware |
| Sensors | Mode often represented by labels | Pyroelectric can, photo track, diaphragm/spring, pivot switch, thermistor, capacitive comb or CT according to mode |
| Timers / thermostats / cut-outs | Generic PCB and relay block | Input conditioning, package leads, relay coil/contacts or thermal snap-disc coupling |
| Heating | Simple heater loop/core | Grooved refractory storage cells, sheathed elements, insulation; immersion threaded boss/gasket/pocket; mat splice/backing |
| Appliances | Shared box/process tokens | Shower can/solenoid/flow path; oven elements/rack structure; hydronic exchanger/circulator; heat-pump compressor/coil |
| Valves | Pointer, shaft and token coil | Reduction gears, wound actuator, return spring, auxiliary switch and compression unions |
| Motors / fan / pump / machinery | Solid shaft/hub without bearings | Bearing balls/races/cages, laminations/cage bars; pump impeller/seal; fan hub/control; shutter gearing, gate worm or compressor piston |
| Contactors / overloads | Simple contacts and coil | Double-break pole tips/arc partitions/E-core/shading ring; three heated bimetals and compensated common trip |
| VFD / PV / battery | Same board and capacitor tokens | Rectifier/DC-link/power modules/heatsink interface; battery cells/interconnect/BMS disconnect |
| PLC / safety relay | Label differentiated generic enclosure | Processor/clock/memory, optocouplers, keyed connectors; distinct force-guided relay modules |
| Alarms / chime | Solid optical disc, sparse chime | Optical labyrinth, piezo sounder, backup clip; resonant bars/supports and plunger spring |
| EV charging | Token contactor and CT | Separated power poles/barrier, sensing winding, control/pilot interface and sealed cover fixings |
| Transformer / driver / DC supply | Same line-frequency E/I transformer | Stacked line-frequency core/windings versus switched ferrite/rectifier board; isolation barrier |
| Cable / conduit / trunking | Solid conductor tips and token gland | Seven individual strands/core, sheath/bedding cutaway; gland compression seal/nut/thread; duct snap lips/divider |
| Instruments | Exterior dial/probes only | Shunt/divider/input fuse/MOV/barriers; split magnetic clamp winding; individual package leads |
| All rear terminals | Solid brass face and dark cross strip | Captive pressure plate, folded current cage, actual entry aperture, recessed screw and helical shank |

The [reference map](reference-map.json) records primary manufacturer material consulted for representative architecture. These are original generic educational models. Semiconductor circuitry, safety processing, process thermodynamics and some transducer mechanisms are conceptual and labelled accordingly. Geometry is not a product-specific service drawing, cable design approval or hardware safety certification.
