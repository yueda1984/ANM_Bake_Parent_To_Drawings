var scriptVar = "1.73";

/*
	Bake Parent to Drawings
	
	Bake selected drawing's parent transformations to the drawing for the selected duration of frames.
	The script creates new cel on each selected cel, copies the entire cel in the camera view,
	disconnects the drawing from its parent, and finally pastes the cel again in the camera view.
	This script is compatible with Harmony 15 and up.
	
	This script DOES NOT bake deformations. To achieve that, use Harmony’s official command instead:
	Animation > Deformation > Convert Deformed Drawing to Drawings
	
	All selected cels must not be sitting in the temp folder. If do then the scene needs to be saved prior to running this script.
	
		v1.1 - Now it also bakes embedded pivot positions.
		v1.2 - Switched from marquee selection to select all command. Now script can be added to any toolbars. Added Confirmation box.
		v1.3 - Added dialog to choose frame range options. Now we can chose to bake only frames when parent peg or drawing of the selected drawing has keys.
		v1.4 - Now we can chose to bake frames at start of each drawing substituition.
		v1.5 - On Harmony 16 and up, having "Apply to All Frames" button turned on will no longer cause an issue.
		v1.6 - This script no longer changes the current tool, Select tool properties and art layer modes.		
		v1.7 - This script used to preserve original cels by creating new cels before baking. Now user have an option to bake the transformation to cels directly.
		v1.71 - Fixed bugs where selecting "Bake Every Frame" option freezes the script.
		v1.72 - Fixed bugs where selecting "Bake Every Frame" option skips the first selected frame.
		v1.73 - "drawing.elementMode" attribute is changed to "drawing.ELEMENT_MODE" to accomodate Harmony 22 update.
		
	 
	Installation:

	1) Download and Unarchive the zip file.
	2) Locate to your user scripts folder (a hidden folder):
	   https://docs.toonboom.com/help/harmony-17/premium/scripting/import-script.html
	   
	3) Add all unzipped files (*.js, *.ui, and script-icons folder) directly to the folder above.	
	3) Add ANM_Bake_Parent_To_Drawings to any view toolbars.
	
	
	Direction:

    1) You can either select a drawing node in Camera/Node view, or select a range of cels (drawing substitutions) in the Timeline. Later will make the script's start and end frames set when the script's option dialog is launched.
	2)Run "ANM_Bake_Parent_To_Drawings".
	
	3)Set Keyframe Options on the launched dialog.
	
		a. "Bake frame at start of drawing substituition"
		   Only create a new cel with the baked transformation on the first frame of each cel exposure.

		b. "Bake frame when parent has key"
		   Only create a new cel with the baked transformation on the frame number when the drawing's parent node has a keyframe.

		c. "Bake every frame"
		   Create a new cel with the baked transformation on every frame.

	4) Set Frame Range Options.
	5) Check "Bake Drawing Pivot Positions" on if you want the script to bake each cel's drawing pivot positions.
	6) Hit OK. This will create new cels on the selected drawing node with the baked transformation of its parent nodes. The script will also unlink the drawing node from its parent so the user can see the accurate result.


	Author:

		Yu Ueda (raindropmoment.com)
*/


function ANM_Bake_Parent_To_Drawings()
{
	main_function();
	
	function main_function()
	{
		var PF = new private_functions;
		var sNode = selection.selectedNode(0);
		if (node.type(sNode) !== "READ")
		{
			MessageBox.information("Please select a drawing before running this script.");
			return;
		}	

		var userPref = PF.optionBox(PF.loadPref());
		if (userPref === null)
			return;

		var useTiming = node.getAttr(sNode, 1, "drawing.ELEMENT_MODE").boolValue();
		var drawCol = node.linkedColumn(sNode, useTiming ? "drawing.element" : "drawing.customName.timing");
		var src = node.srcNode(sNode, 0);	
		
		var keyList = [];
		if (userPref.keyOption === "bakeOnBreak")
			keyList = PF.getCelTimings(drawCol, userPref);
	
		else if (userPref.keyOption === "bakeOnKey")
		{	
			switch (node.type(src))
			{
				case "PEG" : var srcAttrs = ["position.x", "position.y", "scale.x", "scale.y", "rotation.anglez", "skew"]; break;
				case "READ" : var srcAttrs = ["offset.x", "offset.y", "scale.x", "scale.y", "rotation.anglez", "skew"]; break;
				default : var srcAttrs = [];
			}	
			if (srcAttrs.length > 0)
				keyList = PF.getKeyframeTimings(src, drawCol, srcAttrs, userPref);
		}		
		else //userPref.keyOption === "bakeAll"
			for (var fr = userPref.startFrame; fr <= userPref.endFrame; fr++)					
				keyList.push(fr);
		
		/* the current method of duplicating cel does not work on cels that are still in temp dir.
		parse through selected cels to see if any cels that are in temp dir. stop script if is.*/	
		if (userPref.createCel && PF.checkIfInTempDir(sNode, userPref, keyList))
		{
			MessageBox.information("Selected frames include drawings that are still in the temp folder.\nPlease save the current scene before running this script.");
			return;
		}
		
		
		var softwareVer = PF.getSoftwareVer();
		var OGSettings = PF.captureOGSettingsThenApplyPresets(softwareVer);	
		var OGFrame = frame.current();		
		

		scene.beginUndoRedoAccum("Bake parent transformations to drawings");	
		

		// before baking, duplicate the selected cel into unique cels on frame where its parent peg/drawing has a key
		if (userPref.createCel)
			PF.duplicateCel(drawCol, userPref, keyList);
		PF.bake(sNode, src, userPref, keyList);
		
		
		scene.endUndoRedoAccum();
		PF.savePref(userPref);


		// set OG tool and its settings:
		PF.restoreOGSettings(softwareVer, OGSettings);
		Action.perform("deselectAll()", "drawingView,cameraView");
		frame.setCurrent(OGFrame);			
	}
	
	
	function private_functions()
	{
		this.getCelTimings = function(drawCol, userPref)
		{
			var lastCel = column.getEntry (drawCol, 1, userPref.startFrame);			
			var keyList = [], usedCels = [];
			if (lastCel !== "")
				keyList.push(userPref.startFrame);
			
			var fr = userPref.startFrame +1;
			for (fr; fr <= userPref.endFrame; fr++)
			{						
				var curCel = column.getEntry (drawCol, 1, fr);
				
				// If "Preserve Original Cels" option is checked, avoid processing the same cels twice.
				if (!userPref.createCel && usedCels.indexOf(curCel) !== -1)
				{
					lastCel = curCel;				
					continue;
				}
				else if (!userPref.createCel)
					usedCels.push(curCel);
				
				
				if (curCel !== "" && curCel !== lastCel)
					keyList.push(fr);
					
				lastCel = curCel;
			}
			return keyList;			
		};


		this.getKeyframeTimings = function(parentNode, drawCol, attrs, userPref)
		{
			var keyList = [], usedCels = [];
			for (var at in attrs)
			{
				var col = node.linkedColumn(parentNode, attrs[at]);
				for (var cl = 0; cl < func.numberOfPoints(col); cl++)
				{
					var fr = func.pointX(col, cl)
									
					// If "Preserve Original Cels" option is checked, avoid processing the same cels twice.
					if (!userPref.createCel)
					{
						var curCel = column.getEntry (drawCol, 1, fr);
						if (usedCels.indexOf(curCel) !== -1)			
							continue;
						else
							usedCels.push(curCel);	
					}					
					if (keyList.indexOf(fr) === -1)
						keyList.push(fr);
				}
			}
			return keyList;
		};
	
	
		this.checkIfInTempDir = function(argNode, userPref, keyList)
		{
			var useTiming = node.getAttr(argNode, 1, "drawing.ELEMENT_MODE").boolValue();
			var drawCol = node.linkedColumn(argNode, useTiming ? "drawing.element" : "drawing.customName.timing");
			var elemId = column.getElementIdOfDrawing(drawCol);
			
			for (var ky = 0; ky < keyList.length; ky++)
			{
				var curCel = column.getEntry (drawCol, 1, keyList[ky]);	
				var filePath = Drawing.filename(elemId, curCel);
					
				if (filePath.indexOf("ToonBoomSessionTempDir") !== -1)
					return true;
			}
			return false;		
		};


		this.duplicateCel = function(drawCol, userPref, keyList)
		{
			var elemId = column.getElementIdOfDrawing(drawCol);
			var nextCel = "";
			
			if (userPref.endFrame !== frame.numberOf())
				afterEndCel = column.getEntry(drawCol, 1, userPref.endFrame +1);
			
			for (var ky = 0; ky < keyList.length; ky++)
			{
				var fr = keyList[ky];
				
				var curCel = column.getEntry(drawCol, 1, fr);
				nextCel = column.getEntry(drawCol, 1, fr +1);

				// copy current cel as a new fileWrapper...
				var currentCelPath = Drawing.filename(elemId, curCel);
				if (currentCelPath === "")
					continue;

				var copiedCel = new PermanentFile(currentCelPath);

				// ...and then copy it into another new fileWrapper.
				var newCelName = this.getUniqueCelName(elemId, "baked_" + fr);
				Drawing.create(elemId, newCelName, true);
				var newCelPath = Drawing.filename(elemId, newCelName);
				MessageLog.trace(newCelPath);
				var newCelFile = new PermanentFile(newCelPath);
				copiedCel.copy(newCelFile);
				
				column.setEntry (drawCol, 1, fr, newCelName);
				
				// keep the original cel exposed on the next frame.				
				if (nextCel !== "" && userPref.keyOption === "bakeAll")
					column.setEntry(drawCol, 1, fr +1, nextCel);
			}

			// keep the original cel exposed on the frame after the end frame.
			if (userPref.endFrame !== frame.numberOf())
				column.setEntry(drawCol, 1, userPref.endFrame +1, afterEndCel);
		};

		
		this.bake = function(argNode, srcNode, userPref, keyList)
		{						
			for (var ky = 0; ky < keyList.length; ky++)
			{
				var fr = keyList[ky];
				MessageLog.trace(fr);
				frame.setCurrent(fr);
				
				DrawingTools.setCurrentDrawingFromNodeName(argNode, fr);
				Action.perform("onActionChooseSelectTool()", "cameraView");

				// select all and check. If empty, operation ends for the current frame									
				Action.perform("selectAll()", "cameraView");		
				var selection = Action.validate("cut()", "cameraView");
				if (selection.enabled)
				{
					// bake drawing		
					Action.perform("cut()", "cameraView");
					var suc = node.unlink(argNode, 0);	
				
					Action.perform("paste()", "cameraView");
					node.link(srcNode, 0, argNode, 0);			
					
					if (userPref.bakePivot)
					{
						// bake embedded pivot position
						Action.perform("onActionChoosePivotTool()", "cameraView");
						Action.perform("copy()", "cameraView");
						node.unlink(argNode, 0);	
						Action.perform("paste()", "cameraView");
						node.link(srcNode, 0, argNode, 0);	
					}
				}
			}
			node.unlink(argNode, 0);		
		};


		this.getUniqueCelName = function(elemId, argName)
		{
			var suffix = 0;
			var originalName = argName;
	 
			while (Drawing.isExists(elemId, argName))
			{
				suffix ++;
				argName = originalName + "_" + suffix;	
			}	
			return argName;
		};
		
		
		this.loadPref = function()	
		{	
			var loadedData = {};		
			var localPath = specialFolders.userScripts;	
			localPath += "/YU_Script_Prefs/ANM_Bake_Parent_To_Drawings_Pref";
			var file = new File(localPath);
		
			try
			{
				if (file.exists)
				{
					file.open(1) // read only
					var savedData = file.read();
					file.close();

					loadedData.bakeOnBreak = parseInt(savedData.charAt(0));	
					loadedData.bakeOnKey = parseInt(savedData.charAt(1));			
					loadedData.bakeAll = parseInt(savedData.charAt(2));
					loadedData.createCel = parseInt(savedData.charAt(3));						
					loadedData.bakePivot = parseInt(savedData.charAt(4));				
				}
			}
			catch(err){}			
			
			if (Object.keys(loadedData).length === 0)
			{	
				MessageLog.trace("Bake_Parent_To_Drawings: loadedDataerence file is not found. Loading default setting.");
				var preset = {};
				preset.bakeOnBreak = 1;				
				preset.bakeOnKey = 0;
				preset.bakeAll = 0;
				preset.createCel = 1;					
				preset.bakePivot = 1;
						
				loadedData = preset;
			}		
			return loadedData;
		};
		

		this.savePref = function(userPref)
		{
			var saveData = "";
			switch (userPref.keyOption)
			{
				case "bakeOnBreak" : saveData += "100"; break;
				case "bakeOnKey" : saveData += "010"; break;				
				case "bakeAll" : saveData += "001";
			}
			saveData += (userPref.createCel) ? "1" : "0";			
			saveData += (userPref.bakePivot) ? "1" : "0";
			
			var localPath = specialFolders.userScripts + "/YU_Script_Prefs";
			var dir = new Dir;
			if (!dir.fileExists(localPath))
				dir.mkdir(localPath);
			
			localPath += "/ANM_Bake_Parent_To_Drawings_Pref";		
			var file = new File(localPath);
			
			try
			{	
				file.open(2); // write only
				file.write(saveData);
				file.close();
			}
			catch(err){}
		};
		
		
		this.optionBox = function(loadedPref)
		{
			var dialog = new Dialog();
			dialog.title = "Bake Parent Transformations to Drawings v" + scriptVar;
			dialog.width = 300;


			var groupBox1 = new GroupBox();
			groupBox1.title = "Keyframe Option";
			dialog.add(groupBox1);	
			
			var bakeOnBreakRB = new RadioButton();
			bakeOnBreakRB.checked = (loadedPref.bakeOnBreak === 1);
			bakeOnBreakRB.text = "Bake frame at start of drawing substituition";
			
			var bakeOnKeyRB = new RadioButton();
			bakeOnKeyRB.checked = (loadedPref.bakeOnKey === 1);
			bakeOnKeyRB.text = "Bake frame when parent has key";
			
			var bakeAllRB = new RadioButton();
			bakeAllRB.checked = (loadedPref.bakeAll === 1);
			bakeAllRB.text = "Bake every frame";
			groupBox1.add(bakeOnBreakRB);			
			groupBox1.add(bakeOnKeyRB);
			groupBox1.add(bakeAllRB);


			var groupBox2 = new GroupBox();
			groupBox2.title = "Frame Range Option";
			dialog.add(groupBox2);			
			
			var allframesRB = new RadioButton();
			allframesRB.text = "Entire length of the scene";
			allframesRB.checked = (Timeline.numFrameSel > 1) ? false : true;
			
			var selectedFramesRB = new RadioButton();
			selectedFramesRB.text = "Selected frame range";
			selectedFramesRB.checked = (Timeline.numFrameSel > 1) ? true : false;

			var startSB = new SpinBox();			
			startSB.label = "Start frame: ";	
			startSB.maximum = frame.numberOf();
			startSB.minimum = 1;
			startSB.value = Timeline.firstFrameSel;

			var endSB = new SpinBox();					
			endSB.label = "End frame: ";	
			endSB.maximum = frame.numberOf();
			endSB.minimum = 1;
			endSB.value = Timeline.firstFrameSel + Timeline.numFrameSel -1;
			
			groupBox2.add(allframesRB);
			groupBox2.add(selectedFramesRB);	
			groupBox2.add(startSB);
			groupBox2.add(endSB);

			var createCelCB = new CheckBox();
			createCelCB.checked = (loadedPref.createCel === 1);
			createCelCB.text = "Preserve Original Cels (Create New Cels Before baking.)";
			dialog.add(createCelCB);
			
			var bakePivotCB = new CheckBox();
			bakePivotCB.checked = (loadedPref.bakePivot === 1);
			bakePivotCB.text = "Bake Drawing Pivot Positions";
			dialog.add(bakePivotCB);
			
				
			if (!dialog.exec())
				return null;
			
			if (startSB.value > endSB.value)
			{
				MessageBox.information("Error: Start Frame value cannot be greator than End Frame value");
				return null;
			}

			var userPref = {};	
			if (bakeOnBreakRB.checked)
				userPref.keyOption = "bakeOnBreak";	
			else if (bakeOnKeyRB.checked)
				userPref.keyOption = "bakeOnKey";		
			else
				userPref.keyOption = "bakeAll";	
	
			userPref.startFrame = (allframesRB.checked) ? 1 : startSB.value;	
			userPref.endFrame = (allframesRB.checked) ? frame.numberOf() : endSB.value;
			userPref.createCel = createCelCB.checked;
			userPref.bakePivot = bakePivotCB.checked;
			return userPref;			
		};
		
		
		this.getSoftwareVer = function()
		{
			var info = about.getVersionInfoStr();
			info = info.split(" ");
			return parseFloat(info[7]);
		};		


		this.captureOGSettingsThenApplyPresets = function(softwareVer)
		{
			// capture current tool, Select tool settings and the art layer mode...
			var settings = this.captureSelectToolSettings(softwareVer);		
			settings.tool = this.captureCurrentTool(softwareVer);
			settings.artLayer = this.captureArtLayerSettings(softwareVer);		
			
			//...and then set the custom settings
			ToolProperties.setMarkeeMode(false);
			ToolProperties.setSelectByColourMode(false);	
			ToolProperties.setPermanentSelectionMode(false);
			ToolProperties.setApplyAllArts(true);
			
			// if Preview All Art Layers is set on, turn it off
			if (settings.artLayer.boolViewAll)
				Action.perform("onActionPreviewModeToggle()", "artLayerResponder");

			if (softwareVer >= 16)
			{
				settings.frameModeButton.checked = false;
				settings.elementModeButton.checked = false;
			}
			else
			{
				ToolProperties.setApplyAllDrawings(false);	
				settings.syncedDrawingButton.checked = false;
				settings.singleDrawingButton.checked = false;
			}
			return settings;
		};


		this.captureSelectToolSettings = function(softwareVer)
		{
			var settings = {
				boolMarkee: false,
				boolSelectByColor: false,
				boolPermanentSelection:	Action.validate("onActionTogglePermanentSelection()","drawingView").checked,
				boolApplyAllLayers: Action.validate("onActionToggleApplyToolToAllLayers()","drawingView").checked,
				boolSyncedDrawing: false,	syncedDrawingButton: {},
				boolSingleDrawing: false,	singleDrawingButton: {},
				boolElementMode: false,		elementModeButton: {},
				boolFrameMode: false,		frameModeButton: {}
			};	
				
			if (softwareVer < 16)
				settings.boolApplyAllDrawings = Action.validate("onActionToggleApplyToAllDrawings()","drawingView").checked;
				
			var widgets = QApplication.allWidgets();
			for (var w in widgets)
			{
				var widget = widgets[w];
				if (widget.objectName === "SelectProperties")
				{
					var child = widget.children();
					for (var ch in child)
					{
						if (child[ch].objectName === "boxOptions")
						{
							var boxChild = child[ch].children();		
							for (var bx in boxChild)
							{
								if (boxChild[bx].objectName === "frameOptions1")
								{
									var frameChild = boxChild[bx].children();
									for (var fr in frameChild)
									{
										if (frameChild[fr].objectName === "buttonSelectTool" &&
										(frameChild[fr].toolTip === "Lasso" || frameChild[fr].toolTip === "Marquee"))
											settings.boolMarkee = (frameChild[fr].toolTip === "Lasso") ? true : false;
										else if (frameChild[fr].objectName === "buttonSelectByColor")
											settings.boolSelectByColor = frameChild[fr].checked;								
									}
								}
								else if (boxChild[bx].objectName === "frameOptions2")
								{
									var frameChild = boxChild[bx].children();	
									for (var fr in frameChild)
									{
										switch (frameChild[fr].objectName)
										{
											case "buttonElementMode" :
												settings.boolElementMode = frameChild[fr].checked;
												settings.elementModeButton = frameChild[fr]; break;
											case "buttonFrameMode" :
												settings.boolFrameMode = frameChild[fr].checked;										
												settings.frameModeButton = frameChild[fr]; break;
											case "buttonSingleDrawing" :
												settings.boolSingleDrawing = frameChild[fr].checked;										
												settings.singleDrawingButton = frameChild[fr]; break;
											case "buttonApplyLinkedDrawings" :
												settings.boolSyncedDrawing = frameChild[fr].checked;											
												settings.syncedDrawingButton = frameChild[fr];
										}
									}
								}
							}
							break;
						}
					}
					break;				
				}				
			}
			return settings;
		};


		this.captureArtLayerSettings = function()
		{
			var artLayerSettings = {};
			artLayerSettings.boolViewAll = Action.validate("onActionPreviewModeToggle()", "artLayerResponder").checked;
		
			var boolOverlay = Action.validate("onActionOverlayArtSelected()", "artLayerResponder").checked;
			var boolLine = Action.validate("onActionLineArtSelected()", "artLayerResponder").checked;
			var boolColor = Action.validate("onActionColorArtSelected()", "artLayerResponder").checked;

			if (boolOverlay)		artLayerSettings.activeArt = 8;
			else if (boolLine)		artLayerSettings.activeArt = 4;				
			else if (boolColor)	artLayerSettings.activeArt = 2;		
			else /*boolUnderlay*/	artLayerSettings.activeArt = 1;

			return artLayerSettings;
		};
		
		
		this.captureCurrentTool = function(softwareVer)
		{
			if (softwareVer >= 16)	
				return Tools.getToolSettings().currentTool.id;			
			else
			{
				var toolList = [
					"onActionChooseSelectTool()", "onActionChooseCutterTool()", "onActionChooseRepositionAllDrawingsTool()",
					"onActionChooseContourEditorTool()", "onActionChooseCenterlineEditorTool()", "onActionChoosePencilEditorTool()",
					"onActionChooseSpSmoothEditingTool()", "onActionChoosePerspectiveTool()", "onActionChooseEnvelopeTool()",
					"onActionChooseEditTransformTool()", "onActionChooseBrushTool()", "onActionChoosePencilTool()", "onActionChooseTextTool()",
					"onActionChooseEraserTool()", "onActionChoosePaintToolInPaintMode()", "onActionChooseInkTool()",
					"onActionChoosePaintToolInPaintUnpaintedMode()", "onActionChoosePaintToolInRepaintMode()",
					"onActionChoosePaintToolInUnpaintMode()", "onActionChooseStrokeTool()", "onActionChooseCloseGapTool()",
					"onActionChooseLineTool()", "onActionChooseRectangleTool()", "onActionChooseEllipseTool()", "onActionChoosePolylineTool()",
					"onActionChooseDropperTool()", "onActionChoosePivotTool()", "onActionChooseMorphTool()", "onActionChooseGrabberTool()",
					"onActionChooseZoomTool()", "onActionChooseRotateTool()", "onActionChooseSpTransformTool()", "onActionChooseSpInverseKinematicsTool()",
					"onActionChooseSpTranslateTool()", "onActionChooseSpRotateTool()", "onActionChooseSpScaleTool()", "onActionChooseSpSkewTool()",
					"onActionChooseSpMaintainSizeTool()", "onActionChooseSpSplineOffsetTool()", "onActionChooseSpRepositionTool()",
					"onActionChooseSpTransformTool()", "onActionChooseSpInverseKinematicsTool()",
				];		
				for (var tl in toolList)
					if (Action.validate(toolList[tl], "sceneUI").checked)
						return toolList[tl];	
			}
		};
		
		
		this.restoreOGSettings = function(softwareVer, settings)
		{
			if (softwareVer >= 16)	
			{
				Tools.setCurrentTool(settings.tool);
				settings.frameModeButton.checked = settings.boolFrameMode;
				settings.elementModeButton.checked = settings.boolElementMode;		
			}
			else
			{
				Action.perform(settings.tool, "sceneUI");	
				ToolProperties.setApplyAllDrawings(settings.boolApplyAllDrawings);	
				settings.syncedDrawingButton.checked = settings.boolSyncedDrawing;
				settings.singleDrawingButton.checked = settings.boolSingleDrawing;
			}		
			ToolProperties.setMarkeeMode(settings.boolMarkee);	
			ToolProperties.setSelectByColourMode(settings.boolSelectByColor);
			ToolProperties.setPermanentSelectionMode(settings.boolPermanentSelection);
			ToolProperties.setApplyAllArts(settings.boolApplyAllLayers);
			
			DrawingTools.setCurrentArt(settings.artLayer.activeArt);
			if (settings.artLayer.boolViewAll != Action.validate("onActionPreviewModeToggle()", "artLayerResponder").checked)
				Action.perform("onActionPreviewModeToggle()", "artLayerResponder");		
		};	
	}
}