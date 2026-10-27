from io import BytesIO
import base64
import json
from xml.etree import ElementTree as ET
from zipfile import ZIP_DEFLATED, ZipFile

from .models import DragDropAssessment, MatchingAssessment, MultipleResponseAssessment, OrderingAssessment, Scene, ShortAnswerAssessment, SingleChoiceAssessment, TrueFalseAssessment


QTI_21_NAMESPACE = "http://www.imsglobal.org/xsd/imsqti_v2p1"
IMS_CP_NAMESPACE = "http://www.imsglobal.org/xsd/imscp_v1p1"
ET.register_namespace("", QTI_21_NAMESPACE)
ET.register_namespace("imscp", IMS_CP_NAMESPACE)


def qti_tag(local_name: str) -> str:
    return f"{{{QTI_21_NAMESPACE}}}{local_name}"


def cp_tag(local_name: str) -> str:
    return f"{{{IMS_CP_NAMESPACE}}}{local_name}"


def assessment_item_xml(scene: Scene) -> bytes:
    item = scene.assessmentItem
    if item is None:
        raise ValueError("Scene has no assessment item")

    root = ET.Element(qti_tag("assessmentItem"), {
        "identifier": item.identifier,
        "title": item.metadata.title or scene.title,
        "adaptive": "false",
        "timeDependent": "false",
        "{http://www.w3.org/XML/1998/namespace}lang": item.metadata.language,
    })

    if isinstance(item, MultipleResponseAssessment):
        response_cardinality, response_base_type = "multiple", "identifier"
        correct_responses = item.correctResponses
    elif isinstance(item, OrderingAssessment):
        response_cardinality, response_base_type = "ordered", "identifier"
        correct_responses = item.correctOrder
    elif isinstance(item, (DragDropAssessment, MatchingAssessment)):
        response_cardinality, response_base_type = "multiple", "directedPair"
        correct_responses = [f"{pair.sourceIdentifier} {pair.targetIdentifier}" for pair in item.correctMatches]
    elif isinstance(item, ShortAnswerAssessment):
        response_cardinality, response_base_type = "single", "string"
        correct_responses = item.acceptedAnswers
    elif isinstance(item, TrueFalseAssessment):
        response_cardinality, response_base_type = "single", "identifier"
        correct_responses = [item.correctResponse]
    else:
        response_cardinality, response_base_type = "single", "identifier"
        correct_responses = [item.correctResponse]

    response = ET.SubElement(root, qti_tag("responseDeclaration"), {
        "identifier": "RESPONSE",
        "cardinality": response_cardinality,
        "baseType": response_base_type,
    })
    correct = ET.SubElement(response, qti_tag("correctResponse"))
    for value in correct_responses[:1] if isinstance(item, ShortAnswerAssessment) else correct_responses:
        ET.SubElement(correct, qti_tag("value")).text = value

    score = ET.SubElement(root, qti_tag("outcomeDeclaration"), {
        "identifier": "SCORE",
        "cardinality": "single",
        "baseType": "float",
        "normalMaximum": "1",
    })
    score_default = ET.SubElement(score, qti_tag("defaultValue"))
    ET.SubElement(score_default, qti_tag("value")).text = "0"

    feedback = ET.SubElement(root, qti_tag("outcomeDeclaration"), {
        "identifier": "FEEDBACK",
        "cardinality": "single",
        "baseType": "identifier",
    })
    feedback_default = ET.SubElement(feedback, qti_tag("defaultValue"))
    ET.SubElement(feedback_default, qti_tag("value")).text = "incorrect"

    body = ET.SubElement(root, qti_tag("itemBody"))
    if isinstance(item, (SingleChoiceAssessment, MultipleResponseAssessment, TrueFalseAssessment)):
        interaction = ET.SubElement(body, qti_tag("choiceInteraction"), {
            "responseIdentifier": "RESPONSE",
            "shuffle": "false",
            "maxChoices": "1" if isinstance(item, (SingleChoiceAssessment, TrueFalseAssessment)) else str(len(item.choices)),
        })
        ET.SubElement(interaction, qti_tag("prompt")).text = item.prompt
        choices = item.choices if not isinstance(item, TrueFalseAssessment) else [
            ("true", "True"),
            ("false", "False"),
        ]
        for choice in choices:
            identifier, text = (choice.identifier, choice.text) if not isinstance(choice, tuple) else choice
            ET.SubElement(interaction, qti_tag("simpleChoice"), {
                "identifier": identifier,
                "fixed": "false",
            }).text = text
    elif isinstance(item, OrderingAssessment):
        interaction = ET.SubElement(body, qti_tag("orderInteraction"), {
            "responseIdentifier": "RESPONSE",
            "shuffle": "false",
        })
        ET.SubElement(interaction, qti_tag("prompt")).text = item.prompt
        for choice in item.choices:
            ET.SubElement(interaction, qti_tag("simpleChoice"), {
                "identifier": choice.identifier,
            }).text = choice.text
    elif isinstance(item, DragDropAssessment):
        interaction = ET.SubElement(body, qti_tag("associateInteraction"), {
            "responseIdentifier": "RESPONSE",
            "shuffle": "false",
            "maxAssociations": str(len(item.correctMatches)),
        })
        ET.SubElement(interaction, qti_tag("prompt")).text = item.prompt
        for choice in [*item.draggables, *item.targets]:
            ET.SubElement(interaction, qti_tag("simpleAssociableChoice"), {
                "identifier": choice.identifier,
                "matchMax": "1",
            }).text = choice.text
    elif isinstance(item, MatchingAssessment):
        interaction = ET.SubElement(body, qti_tag("matchInteraction"), {
            "responseIdentifier": "RESPONSE",
            "shuffle": "false",
            "maxAssociations": str(len(item.correctMatches)),
        })
        ET.SubElement(interaction, qti_tag("prompt")).text = item.prompt
        for choices in (item.leftItems, item.rightItems):
            match_set = ET.SubElement(interaction, qti_tag("simpleMatchSet"))
            for choice in choices:
                ET.SubElement(match_set, qti_tag("simpleAssociableChoice"), {
                    "identifier": choice.identifier,
                    "matchMax": "1",
                }).text = choice.text
    elif isinstance(item, ShortAnswerAssessment):
        paragraph = ET.SubElement(body, qti_tag("p"))
        prompt = ET.SubElement(paragraph, qti_tag("span"))
        prompt.text = item.prompt
        prompt.tail = " "
        ET.SubElement(paragraph, qti_tag("textEntryInteraction"), {
            "responseIdentifier": "RESPONSE",
            "expectedLength": "40",
        })

    processing = ET.SubElement(root, qti_tag("responseProcessing"))
    condition = ET.SubElement(processing, qti_tag("responseCondition"))
    response_if = ET.SubElement(condition, qti_tag("responseIf"))
    if isinstance(item, ShortAnswerAssessment):
        answer_match = ET.SubElement(response_if, qti_tag("or"))
        for answer in item.acceptedAnswers:
            match = ET.SubElement(answer_match, qti_tag("stringMatch"), {"caseSensitive": str(item.caseSensitive).lower()})
            ET.SubElement(match, qti_tag("variable"), {"identifier": "RESPONSE"})
            ET.SubElement(match, qti_tag("baseValue"), {"baseType": "string"}).text = answer
    else:
        match = ET.SubElement(response_if, qti_tag("match"))
        ET.SubElement(match, qti_tag("variable"), {"identifier": "RESPONSE"})
        ET.SubElement(match, qti_tag("correct"), {"identifier": "RESPONSE"})
    correct_score = ET.SubElement(response_if, qti_tag("setOutcomeValue"), {"identifier": "SCORE"})
    ET.SubElement(correct_score, qti_tag("baseValue"), {"baseType": "float"}).text = "1"
    correct_feedback = ET.SubElement(response_if, qti_tag("setOutcomeValue"), {"identifier": "FEEDBACK"})
    ET.SubElement(correct_feedback, qti_tag("baseValue"), {"baseType": "identifier"}).text = "correct"

    response_else = ET.SubElement(condition, qti_tag("responseElse"))
    incorrect_score = ET.SubElement(response_else, qti_tag("setOutcomeValue"), {"identifier": "SCORE"})
    ET.SubElement(incorrect_score, qti_tag("baseValue"), {"baseType": "float"}).text = "0"
    incorrect_feedback = ET.SubElement(response_else, qti_tag("setOutcomeValue"), {"identifier": "FEEDBACK"})
    ET.SubElement(incorrect_feedback, qti_tag("baseValue"), {"baseType": "identifier"}).text = "incorrect"

    ET.SubElement(root, qti_tag("modalFeedback"), {
        "outcomeIdentifier": "FEEDBACK",
        "identifier": "correct",
        "showHide": "show",
    }).text = item.correctFeedback
    ET.SubElement(root, qti_tag("modalFeedback"), {
        "outcomeIdentifier": "FEEDBACK",
        "identifier": "incorrect",
        "showHide": "show",
    }).text = item.incorrectFeedback

    extension = {
        "metadata": item.metadata.model_dump(mode="json"),
        "type": item.type,
        "settings": scene.assessmentSettings.model_dump(mode="json") if scene.assessmentSettings else None,
    }
    if isinstance(item, DragDropAssessment):
        extension["dragSources"] = [choice.identifier for choice in item.draggables]
    encoded = base64.b64encode(json.dumps(extension, ensure_ascii=False).encode("utf-8"))
    xml = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    declaration, body_xml = xml.split(b"\n", 1)
    return declaration + b"\n<?chimera " + encoded + b"?>\n" + body_xml


def assessment_test_xml(scenes: list[Scene], title: str) -> bytes:
    items = [scene for scene in scenes if scene.assessmentItem is not None]
    if len(items) < 2:
        raise ValueError("An assessment test requires at least two assessment items")
    identifiers = [scene.assessmentItem.identifier for scene in items if scene.assessmentItem is not None]
    if len(set(identifiers)) != len(identifiers):
        raise ValueError("Assessment item identifiers must be unique within a test")

    root = ET.Element(qti_tag("assessmentTest"), {
        "identifier": "ASSESSMENT_TEST",
        "title": title,
    })
    ET.SubElement(root, qti_tag("outcomeDeclaration"), {
        "identifier": "SCORE",
        "cardinality": "single",
        "baseType": "float",
        "normalMaximum": str(len(items)),
    })
    test_part = ET.SubElement(root, qti_tag("testPart"), {
        "identifier": "TEST_PART",
        "navigationMode": "linear",
        "submissionMode": "individual",
    })
    section = ET.SubElement(test_part, qti_tag("assessmentSection"), {
        "identifier": "ASSESSMENT_SECTION",
        "title": title,
        "visible": "true",
        "keepTogether": "false",
    })
    for scene in items:
        item = scene.assessmentItem
        if item is None:
            continue
        ET.SubElement(section, qti_tag("assessmentItemRef"), {
            "identifier": item.identifier,
            "href": f"items/{item.identifier}.xml",
        })

    processing = ET.SubElement(root, qti_tag("outcomeProcessing"))
    total_score = ET.SubElement(processing, qti_tag("setOutcomeValue"), {"identifier": "SCORE"})
    ET.SubElement(total_score, qti_tag("sum")).append(ET.Element(qti_tag("testVariables"), {"variableIdentifier": "SCORE"}))
    return ET.tostring(root, encoding="utf-8", xml_declaration=True)


def assessment_test_package(scenes: list[Scene], title: str) -> bytes:
    items = [scene for scene in scenes if scene.assessmentItem is not None]
    test_xml = assessment_test_xml(items, title)

    manifest = ET.Element(cp_tag("manifest"), {"identifier": "CHIMERA_QTI_PACKAGE"})
    metadata = ET.SubElement(manifest, cp_tag("metadata"))
    ET.SubElement(metadata, cp_tag("schema")).text = "QTI Package"
    ET.SubElement(metadata, cp_tag("schemaversion")).text = "2.1.0"
    ET.SubElement(manifest, cp_tag("organizations"))
    resources = ET.SubElement(manifest, cp_tag("resources"))
    test_resource = ET.SubElement(resources, cp_tag("resource"), {
        "identifier": "RES_ASSESSMENT_TEST",
        "type": "imsqti_test_xmlv2p1",
        "href": "assessmentTest.xml",
    })
    ET.SubElement(test_resource, cp_tag("file"), {"href": "assessmentTest.xml"})

    item_resources: list[tuple[str, bytes]] = []
    for scene in items:
        item = scene.assessmentItem
        if item is None:
            continue
        resource_id = f"RES_ITEM_{item.identifier}"
        href = f"items/{item.identifier}.xml"
        ET.SubElement(test_resource, cp_tag("dependency"), {"identifierref": resource_id})
        item_resource = ET.SubElement(resources, cp_tag("resource"), {
            "identifier": resource_id,
            "type": "imsqti_item_xmlv2p1",
            "href": href,
        })
        ET.SubElement(item_resource, cp_tag("file"), {"href": href})
        item_resources.append((href, assessment_item_xml(scene)))

    manifest_xml = ET.tostring(manifest, encoding="utf-8", xml_declaration=True)
    package = BytesIO()
    with ZipFile(package, "w", ZIP_DEFLATED) as archive:
        archive.writestr("imsmanifest.xml", manifest_xml)
        archive.writestr("assessmentTest.xml", test_xml)
        for path, content in item_resources:
            archive.writestr(path, content)
    return package.getvalue()
